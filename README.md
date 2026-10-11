# qv-relay

Cloudflare Worker relay for the QuantView / QuantEdge app (CORS + allow-list, **not** an open proxy).

- `GET /?url=<encoded https url>` — fetch an allow-listed host (see `POLICY` in `index.js`; per-host cache TTL, Referer, Authorization only for T-Bank).
- `GET /health` — `{ok, v, hosts, ws}`.
- `WS /ws/binance` — WebSocket pass-through to `wss://data-stream.binance.vision/ws` (Binance trade streams, SUBSCRIBE messages).
- Binance REST hosts are never cached (live prices).

Deploy: Cloudflare → Workers → import this repo (`wrangler.jsonc`, main `index.js`). Test offline: `node test.mjs`.
In the app: Σ-panel → relay address (`qe_relay`), default `https://relay.futuretrainingnow.com`.
Caveat: Binance may still refuse some Cloudflare egress regions (HTTP 451); the app then falls back to Yahoo.
