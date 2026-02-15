// Web Push protocol implementation for Cloudflare Workers
// Uses Web Crypto API — no Node.js dependencies
// Implements RFC 8291 (Message Encryption) + RFC 8292 (VAPID)

export interface VapidKeys {
  publicKey: string;   // base64url 65-byte uncompressed EC point
  privateKey: string;  // base64url 32-byte raw private key
  subject: string;     // "mailto:..." or "https://..."
}

export interface PushSub {
  endpoint: string;
  p256dh: string;  // base64url
  auth: string;    // base64url
}

/* ── Base64URL ── */

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const v of b) s += String.fromCharCode(v);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function unb64url(s: string): Uint8Array {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}

/* ── HMAC-SHA-256 ── */

async function hmac256(key: BufferSource, data: BufferSource): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey(
    'raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return crypto.subtle.sign('HMAC', k, data);
}

/* ── HKDF (single-block expand, sufficient for ≤32 byte outputs) ── */

async function hkdfExtract(salt: Uint8Array, ikm: Uint8Array): Promise<ArrayBuffer> {
  return hmac256(salt.length ? salt : new Uint8Array(32), ikm);
}

async function hkdfExpand(prk: ArrayBuffer, info: Uint8Array, len: number): Promise<Uint8Array> {
  const d = new Uint8Array(info.length + 1);
  d.set(info);
  d[info.length] = 1;
  return new Uint8Array(await hmac256(prk, d)).slice(0, len);
}

/* ── VAPID JWT (ES256) ── */

async function createVapidJwt(
  aud: string, sub: string, pubB64: string, privB64: string
): Promise<string> {
  const te = new TextEncoder();
  const header = b64url(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;
  const payload = b64url(te.encode(JSON.stringify({ aud, exp, sub })));
  const unsigned = `${header}.${payload}`;

  // Build JWK from raw public + private key bytes
  const rawPub = unb64url(pubB64);   // 65 bytes: 0x04 || x(32) || y(32)
  const rawPriv = unb64url(privB64); // 32 bytes

  const key = await crypto.subtle.importKey('jwk', {
    kty: 'EC', crv: 'P-256',
    x: b64url(rawPub.slice(1, 33)),
    y: b64url(rawPub.slice(33, 65)),
    d: b64url(rawPriv),
  }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);

  // Web Crypto returns IEEE P1363 format (r||s, 64 bytes) — exactly what JWT ES256 needs
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(unsigned)
  );

  return `${unsigned}.${b64url(sig)}`;
}

/* ── RFC 8291 payload encryption (aes128gcm) ── */

async function encryptPayload(sub: PushSub, plaintext: string): Promise<Uint8Array> {
  const te = new TextEncoder();

  // Decode subscription keys
  const uaPubRaw = unb64url(sub.p256dh);  // 65 bytes
  const authSecret = unb64url(sub.auth);   // 16 bytes

  // Generate ephemeral ECDH key pair
  const ephemeral = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']
  ) as CryptoKeyPair;

  const asPubRaw = new Uint8Array(
    await crypto.subtle.exportKey('raw', ephemeral.publicKey)
  );

  // Import subscriber's public key
  const uaPubKey = await crypto.subtle.importKey(
    'raw', uaPubRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, []
  );

  // ECDH shared secret
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: uaPubKey }, ephemeral.privateKey, 256
    )
  );

  // IKM = HKDF(auth_secret, shared_secret, "WebPush: info\0" || ua_public || as_public, 32)
  const infoPrefix = te.encode('WebPush: info\0');
  const keyInfo = new Uint8Array(infoPrefix.length + 65 + 65);
  keyInfo.set(infoPrefix);
  keyInfo.set(uaPubRaw, infoPrefix.length);
  keyInfo.set(asPubRaw, infoPrefix.length + 65);

  const authPrk = await hkdfExtract(authSecret, sharedSecret);
  const ikm = await hkdfExpand(authPrk, keyInfo, 32);

  // Random salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // PRK, CEK, nonce
  const prk = await hkdfExtract(salt, ikm);
  const cek = await hkdfExpand(prk, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdfExpand(prk, te.encode('Content-Encoding: nonce\0'), 12);

  // Pad: plaintext || 0x02 (final record delimiter)
  const plainBytes = te.encode(plaintext);
  const padded = new Uint8Array(plainBytes.length + 1);
  padded.set(plainBytes);
  padded[plainBytes.length] = 2;

  // AES-128-GCM encrypt (output includes 16-byte tag)
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, padded)
  );

  // Build aes128gcm body: salt(16) | rs(4) | idlen(1) | keyid(65) | ciphertext
  const rs = 4096;
  const header = new Uint8Array(86); // 16 + 4 + 1 + 65
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, rs, false);
  header[20] = 65;
  header.set(asPubRaw, 21);

  const body = new Uint8Array(header.length + encrypted.length);
  body.set(header);
  body.set(encrypted, header.length);
  return body;
}

/* ── Send push notification ── */

export async function sendPush(
  sub: PushSub,
  message: { title: string; body: string; tag?: string; data?: Record<string, any> },
  vapid: VapidKeys
): Promise<{ ok: boolean; status: number }> {
  const payload = JSON.stringify(message);
  const body = await encryptPayload(sub, payload);

  const endpoint = new URL(sub.endpoint);
  const aud = `${endpoint.protocol}//${endpoint.host}`;
  const jwt = await createVapidJwt(aud, vapid.subject, vapid.publicKey, vapid.privateKey);

  const resp = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${jwt}, k=${vapid.publicKey}`,
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL': '86400',
    },
    body,
  });

  // 410 Gone = subscription expired, clean it up
  return { ok: resp.status === 201, status: resp.status };
}
