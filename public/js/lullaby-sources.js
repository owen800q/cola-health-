/**
 * Where the lullaby MP3 is played from.
 *
 * Users in mainland China often can't stream it from this Cloudflare site, so
 * the player tries, in order:
 *   - a relay saved on this device (same contract as the samsung-bilibili relay:
 *     {relay}/proxy/{host}/{path}), when one is set;
 *   - this site;
 *   - a China-reachable copy on jsDelivr (the CDN the app already loads Vue from).
 * The route the user picks narrows that list. In auto mode the last source
 * that played goes first, so the next play starts straight away.
 */
(function (root) {
  var PATH = '/sleeping_song.mp3';
  // Pinned to the commit that added the file, so the CDN copy never changes.
  var CN_MIRROR = 'https://fastly.jsdelivr.net/gh/owen800q/cola-health-@77e945d/public/sleeping_song.mp3';
  var ROUTES = ['auto', 'direct', 'cn', 'proxy'];
  var LABELS = { auto: '自動', direct: '香港', cn: '中國', proxy: '代理' };

  function normalizeProxy(value) {
    var v = String(value || '').trim().replace(/\/+$/, '');
    if (!v) return '';
    if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
    try { new URL(v); } catch (e) { return ''; }
    return v;
  }

  function relayUrl(proxy, target) {
    var u = new URL(target);
    return proxy + '/proxy/' + u.host + u.pathname + u.search;
  }

  function sources(opts) {
    var direct = opts.origin + PATH;
    var proxy = normalizeProxy(opts.proxy);
    var viaProxy = proxy ? relayUrl(proxy, direct) : null;
    var list;
    switch (opts.route) {
      case 'direct': list = [direct]; break;
      case 'cn': list = [CN_MIRROR]; break;
      case 'proxy': list = viaProxy ? [viaProxy] : [CN_MIRROR]; break;
      default:
        list = [viaProxy, direct, CN_MIRROR].filter(Boolean);
        if (opts.lastGood && list.indexOf(opts.lastGood) > 0) {
          list.splice(list.indexOf(opts.lastGood), 1);
          list.unshift(opts.lastGood);
        }
    }
    return list;
  }

  var api = { PATH: PATH, CN_MIRROR: CN_MIRROR, ROUTES: ROUTES, LABELS: LABELS,
    normalizeProxy: normalizeProxy, relayUrl: relayUrl, sources: sources };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LullabySources = api;
})(this);
