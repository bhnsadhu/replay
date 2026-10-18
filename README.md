# Replay

A live, multiplayer guess-the-song game with an arcade look. The full plan is in [PLAN.md](PLAN.md).

## Develop

Requires Node 24.

```bash
npm install
npm run dev      # game server on :8787, website on :5173
```

Open http://localhost:5173. To test on a phone, open `http://<your-laptop-ip>:5173` on the same Wi-Fi.

```bash
npm run check    # typecheck + lint + tests
npm run build    # production build of the website
```

## Layout

| Folder | What |
|---|---|
| `shared/` | Message types and game rules used by both sides |
| `server/` | Node + `ws` game server (deployed on Render, see `render.yaml`) |
| `client/` | Vite + React website (deployed on Vercel, see `vercel.json`) |

## Test scripts

Each plays real games against a running server (`npm run dev`, or pass a URL and origin for production):

```bash
cd server
npx tsx scripts/simulate.ts       # 1 TV + 6 phones: full game, vote, kick, host handoff
npx tsx scripts/public-sim.ts     # the public room
npx tsx scripts/host-controls.ts  # PAUSE / SKIP SONG / END
npx tsx scripts/vote-timeout.ts   # REPLAY? vote running out
# These need a fresh local server with special settings (see the top of each file):
npx tsx scripts/resilience.ts     # drops, rejoins, heartbeats, host grace, seat expiry
npx tsx scripts/limits.ts         # rate limits
# Production: npx tsx scripts/simulate.ts wss://replay-api.bhanusadhu.com/ws https://replay.bhanusadhu.com
```

## Hosting

- Website: Vercel at https://replay.bhanusadhu.com (set `VITE_SERVER_URL`).
- Game server: Render free tier at https://replay-api.bhanusadhu.com. It sleeps when idle, so the first visitor waits up to a minute; the site shows "WAKING THE SERVER" and queues their tap.
- Rooms live in server memory: a deploy or restart ends games in progress.
- Abuse limits (`server/src/limits.ts`) key on Cloudflare's `cf-connecting-ip`; `/health` reports which source it used.
