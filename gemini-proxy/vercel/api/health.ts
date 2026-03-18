export const config = { runtime: "edge" };

export default function handler(): Response {
  return new Response(
    JSON.stringify({ status: "ok", ts: Date.now() }),
    { headers: { "Content-Type": "application/json" } },
  );
}
