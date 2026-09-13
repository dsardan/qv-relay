// QuantView CORS relay — Cloudflare Worker.
//
// Why this exists: the app runs from file:// inside a WebView, so every source that does
// not send Access-Control-Allow-Origin has to be reached through a relay. It used to rely
// on two public relays (corsproxy.io, api.allorigins.win); when both went down on
// 2026-09-05 the app lost Yahoo, Google News, Finviz and Wikipedia at once and fell back
// to Stooq alone. A private relay removes that dependency.
//
// IMPORTANT — this is deliberately NOT an open proxy. Only the hosts the app actually
// needs are allowed. An unrestricted relay on your own domain will be discovered and used
// by strangers to launder traffic, and the bill and the abuse reports arrive at your door.

const ALLOW = new Set([
  "query1.finance.yahoo.com",
  "query2.finance.yahoo.com",
  "query1.finance.yahoo.com.",       // trailing-dot variants some resolvers produce
  "news.google.com",
  "finviz.com",
  "en.wikipedia.org",
  "stooq.com",
  "www.sec.gov",
  "data.sec.gov",
  "nfs.faireconomy.media",      // Forex Factory weekly macro calendar
  "cdn-nfs.faireconomy.media",
]);

const UPSTREAM_TIMEOUT_MS = 8000;
const CACHE_TTL_S = 60;               // quotes move; a minute is enough to absorb bursts

function withCors(body, init) {
  const h = new Headers((init && init.headers) || {});
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  h.set("Access-Control-Allow-Headers", "*");
  h.set("Access-Control-Max-Age", "86400");
  h.delete("set-cookie");             // never relay upstream cookies back to the client
  return new Response(body, { ...(init || {}), headers: h });
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return withCors(null, { status: 204 });

    const target = new URL(request.url).searchParams.get("url");
    if (!target) return withCors("missing ?url=", { status: 400 });

    let t;
    try { t = new URL(target); } catch { return withCors("malformed url", { status: 400 }); }
    if (t.protocol !== "https:") return withCors("https only", { status: 400 });
    if (!ALLOW.has(t.hostname)) return withCors("host not allowed: " + t.hostname, { status: 403 });

    const init = {
      method: request.method,
      headers: {
        // Yahoo rejects requests without a browser-shaped UA.
        "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "Accept": request.headers.get("accept") || "*/*",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cf: { cacheTtl: CACHE_TTL_S, cacheEverything: true },
    };
    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = await request.arrayBuffer();
      const ct = request.headers.get("content-type");
      if (ct) init.headers["Content-Type"] = ct;
    }

    let res;
    try {
      res = await fetch(t.toString(), init);
    } catch (e) {
      // Surface the real reason so the app can tell a dead upstream from a dead relay.
      return withCors("upstream failed: " + (e && e.name === "TimeoutError" ? "timeout" : String(e)),
        { status: 502 });
    }

    const h = new Headers(res.headers);
    h.delete("set-cookie");
    h.set("X-QV-Relay", "1");
    return withCors(res.body, { status: res.status, statusText: res.statusText, headers: h });
  },
};
