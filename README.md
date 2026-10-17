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
