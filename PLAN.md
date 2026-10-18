# Replay: build plan

Replay is a live multiplayer guess-the-song game. A clip plays, everyone picks A, B, C or D, and the fastest correct answers score the most. It looks and feels like an arcade cabinet (the VHS effects are decoration on top), and it works three ways:

- **Party:** one TV or laptop shows the game and plays the music. Phones are the buttons.
- **Remote:** a private room with no TV. Every phone plays the clip. Made for friends on a call.
- **Public:** one always-on room anyone can drop into. Each person plays on their own device.

Inspiration: [Mixtape](https://mixtape-game.fly.dev/), a single global "radio station". Replay differs in three ways: an arcade identity, private rooms with party mode, and remote play.

**Design source of truth:** the canvas at https://claude.ai/artifact/LqxAe66erGFC2u4i6LKwom, page **Replay flow**. Every screen below exists there as a mockup. The page **Style options** holds rejected directions; ignore it.

---

## 1. Approved decisions

| Area | Decision |
|---|---|
| Name | Replay |
| Look | Option A, "VHS Arcade" (section 4) |
| Answer format | Multiple choice only (A–D) |
| Rounds | 10 per game |
| Clip | 15 seconds of a 30-second Deezer preview |
| Reveal | 5 seconds |
| Scoring | Section 6 |
| Client | Vite + React + TypeScript |
| Server | Node + `ws`, rooms held in memory, server decides everything |
| Shared | One `shared/` package with message types and constants |
| Hosting (free) | Website on **Vercel** (Hobby). Game server on **Render** free tier. |
| Music | Deezer public API (fetched on the server, audio played through our server) |
| Domain | Website: `replay.bhanusadhu.com`. Game server: `replay-api.bhanusadhu.com`. Invite links: `replay.bhanusadhu.com/WXQK` |
| Workflow | Commit and push to `main` after each finished chunk of work |

---

## 2. Modes and how sound works

| Mode | Who creates it | Who plays sound | Phone round screen |
|---|---|---|---|
| Party (`sound: "tv"`) | A TV or laptop taps HOST A ROOM | Only the TV. Phones stay silent. | Round (party) phone |
| Remote (`sound: "all"`) | A phone taps HOST A ROOM, or the host switches SOUND to ALL PHONES | Every phone | Round (public / remote) phone |
| Public | Always running | Every device | Round (public / remote) phone or desktop |

- Browsers block audio until the user interacts with the page. The TV gets a "PRESS ANY KEY" screen. Phones are unlocked by the PRESS START tap (lobby) or the first-time initials screen (public).
- In remote and public modes, the reveal phone adds a top-3 strip and the game over phone adds the full final board (there is no TV to show them).

---

## 3. Screens (canvas → route/component)

| # | Canvas artboard | Device | Notes |
|---|---|---|---|
| 1 | Home · TV / desktop, Home · Phone | both | Menu: PLAY PUBLIC, HOST A ROOM, JOIN WITH CODE |
| 2 | Host setup · TV | TV | "PRESS ANY KEY" sound gate. Only shown for TV-hosted rooms. |
| 2 | Host setup · Host phone | phone | Rules (rounds, clip, mix, sound), players with remove, START, tap code to copy invite |
| 3 | Lobby · TV, Lobby · Phone | both | Big room code, 8 slots, initials picker, READY |
| 4 | Round (party) · TV, Phone | both | Waveform, A–D, HI-SCORE, segmented timer |
| 5 | Public · Phone (first time) | phone | One-time initials, then joins at the next round |
| 5 | Round (public / remote) · Desktop, Phone | both | Clickable answers, keys 1–4, top 10 plus your row, "Playing on this phone" |
| 6 | Reveal · TV, Reveal · Phone (correct) | both | Answer with glitch effect, who picked what, points breakdown, save to Spotify / Apple Music |
| 7 | Reveal · Phone (wrong), (no answer) | phone | MISSED or TIME'S UP, streak lost |
| 8 | Game Over · TV, Phone | both | Awards, final board, REPLAY? vote, share score card |
| 9 | Options · Phone | phone | Sound, reduce effects, change initials, leave (press twice) |

Not drawn yet, but specified by rules: the remote versions of reveal and game over (add the board strip), the desktop initials picker (same component as the phone), and the host's in-game controls (PAUSE / SKIP SONG / END).

---

## 4. Design system

### Tokens

```css
--bg:      #07060f;  /* page */
--ink:     #e9e6ff;  /* main text */
--dim:     #9b97c9;  /* secondary text */
--line:    #2a2850;  /* borders, inactive */
--off:     #1b1a33;  /* unlit timer segments */
--pink:    #ff3ea5;  /* answer A, streaks */
--cyan:    #2de2e6;  /* answer B, room code, links */
--yellow:  #f9f871;  /* answer C, time, leader, primary action */
--green:   #7cff6b;  /* answer D, correct, ready */
--white:   #ffffff;  /* logo, big code */
```

- **Display font:** Press Start 2P, used **only** for the logo, letters, scores, headings and button labels.
- **Body font:** VT323, used for everything else, **including song titles**.
- Effects: scanlines (`repeating-linear-gradient`, 3.5% white), split pink/cyan shadow on the logo and big code, neon glow on active borders. Every effect turns off under **Reduce effects** and `prefers-reduced-motion`.

### Rules that must hold everywhere

1. **Each color has one meaning.** Pink/cyan/yellow/green are always A/B/C/D. Each also has one secondary meaning: streak, code, time/leader, correct/ready. Never use them for decoration.
2. **A VHS status label for each stage**, shown in the header (TV) or top row (phone):
   - home: ▶ PLAY
   - setup / lobby: ■ STOP
   - round: ▶ PLAY
   - reveal: ❚❚ PAUSE
   - game over: ◀◀ REW
3. **TV frame:** padding 36/48. The header always shows the status label (left), the REPLAY logo (center) and the room code (right). Body: main column plus a 300px boxed side column. The footer is a status line or the segmented timer.
4. **Phone frame:** padding 28/20. Top row: context on the left; the status label and the 44px options gear on the right. Then the player card: player number and initials on the left, streak and score on the right. The status line sits at the bottom.
5. **Players are 3-letter initials** everywhere.
6. Touch targets ≥ 44px. Every control is a real `<button>` / `<a>`. Focus outline: 3px white.

### Shared components to build first

`Scanlines`, `TvHeader`, `PhoneTopRow` (with `OptionsButton`), `PlayerCard`, `AnswerButton` (phone, desktop), `AnswerTile` (TV), `SegmentTimer`, `HiScoreBox`, `StatusLine`, `InitialsPicker`, `TrackCard` (with save links), `Stepper`, `Toggle`.

---

## 5. Game rules

**Hosting**
- When HOST A ROOM is tapped on a TV or laptop, that screen shows the game and plays the music. The first phone to join becomes host.
- When HOST A ROOM is tapped on a phone, that phone is the host and `sound` starts as `"all"`.
- If the host leaves, host passes to the next player by join order. If the host only drops (reload, lost signal), they keep the role for 10 s first.
- The host phone gets PAUSE, SKIP SONG and END during the game. Tapping the room code copies an invite link.
  - They live in the options sheet (gear). SKIP SONG during a round drops it unscored and plays a different song as the same round; during a reveal it moves on right away. A host pause survives the TV dropping and coming back; only the host resumes it.
- If the TV drops, the room pauses until it reconnects (the interrupted round replays from the top). The room closes if the TV is gone for 60 s. Abrupt drops are noticed by a 12 s server heartbeat.

**Players**
- Initials are A–Z, 3 characters. Duplicates get a number (DEV, then DE2…DE9). A blocklist rejects rude words.
- Public players pick initials once; they're stored on the device.
- Up to 8 players per private room.
- Late joiners come in between rounds with 0 points.
- A dropped phone keeps its seat and score for 60 seconds (a session token is stored on the device).

**After a game**
- The REPLAY? vote runs for 10 seconds. A majority starts a new game in the same room with the same rules. Otherwise everyone goes back to the lobby.

**Public**
- Runs nonstop in **sets of 10 rounds** (one "credit"). Your score resets each set. "Today's best" is the best set scores from the last 24 hours (kept in server memory, so a redeploy clears it). Mixes rotate set by set, with a 12 s results break between sets.
- Top 10 plus your own row. Clean versions only (skip tracks with `explicit_lyrics`).
- Rounds work the same as private rooms; nobody hosts.

---

## 6. Scoring

```
correct:  1000
        + speed  = round10( 500 × (1 − t / clipSeconds) )   // t clamped to [0, clip]
        + streak = min(50 × streak, 250)                     // streak counts this answer
wrong / no answer: 0, and the streak resets to 0
ties: lower total answer time wins
max game (10 rounds): 17,500
```

Example (from the mockups): DEV answers correctly at 7.2s of a 15s clip, on a streak of 4. That gives 1000 + 260 + 200 = **+1,460**.

Awards on game over: best streak, fastest correct answer, most correct, and "nobody got" (a round no one answered correctly).

---

## 7. Architecture

```
replay/
  shared/   types.ts (messages, state), constants.ts (timings, scoring), scoring.ts
  server/   index.ts (HTTP + ws), rooms/ (state machine), music/ (Deezer, question generator), audio proxy
  client/   Vite React app: screens/, components/, net/ (socket, clock sync), audio/
```

Two free deployments:

- **Website (`client/`)** is built and served by Vercel. It reads the game server's address from `VITE_SERVER_URL`.
- **Game server (`server/`)** runs on Render's free tier. It serves `/ws` (WebSocket), `/audio/:roundId` (clips) and `/health`. It only accepts connections from the website's address.
- **Waking up:** after 15 minutes with no traffic, Render puts the free server to sleep, and waking it takes about a minute.
  - On load, the website calls `/health` and shows a "WARMING UP THE CABINET…" screen until the server answers.
  - Live connections keep the server awake during play.
  - Rooms are lost only when the server sleeps, which only happens when nobody is connected.
- **Upgrade path** if the wake-up wait becomes a problem: a paid Render instance, or a move to Cloudflare Workers + Durable Objects.

### Room state machine (server-owned)

```
SETUP (TV-hosted only, until the TV presses a key)
  → LOBBY
  → ROUND_INTRO (~1.5s preload) → GUESSING (clip length) → REVEAL (5s)  ×N
  → GAME_OVER (10s vote) → ROUND_INTRO (replay) | LOBBY
PAUSED can sit on top of any playing state (host action or the TV dropping).
```

The public room is one always-on instance of the same machine with no host and no lobby (it runs sets back to back).

### Messages (draft; lives in `shared/types.ts`)

Client → server:
- `hello { sessionToken? }`
- `createRoom { sound }`
- `joinRoom { code }`
- `joinPublic`
- `setInitials { initials }`
- `ready { ready }`
- `host:rules { rounds, clipSec, mix, sound }`
- `host:start`
- `host:pause`
- `host:skip`
- `host:end`
- `host:kick { playerId }`
- `tv:soundOn`
- `guess { roundId, choice, elapsedMs }`
- `vote { replay }`
- `leave`
- `ping { t }`

Server → client:
- `welcome { sessionToken, playerId, serverTime }`
- `room { code, phase, players, rules, hostId, round? }`
- `roundStart { roundId, index, options[4], audioUrl, startAt, durationMs }`
- `guessAck { roundId, choice }`
- `reveal { roundId, correct, track, picks, deltas, board }`
- `gameOver { board, awards, voteEndsAt }`
- `error { code, message }`
- `pong { t, serverTime }`

### Timing and cheating

- **Clock sync:** the client sends `ping` every few seconds and keeps the median offset to server time.
- **Start time:** `roundStart.startAt` = server now + 1.5s. Clients preload the audio and start it at `startAt`, adjusted by their offset. When there are no sound devices (a TV-only party), phones still show the timer from `startAt`.
- **Speed:** each device times `elapsedMs` from its own audio `playing` event (or from `startAt` if it plays no sound).
- **Server checks:** reject the guess if `elapsedMs` > clip + 500ms. Reject if it's more than 2s faster than `receivedAt − startAt` (this caps the cheating window). Accept one guess per player per round.
- **The answer stays secret until the reveal.** Options are sent shuffled. `audioUrl` points to our `/audio/:roundId` proxy, so the Deezer track ID never reaches the client before the reveal.

### Music (Deezer)

- Endpoints (fetched on the server; check in milestone M2): `GET https://api.deezer.com/chart/0/tracks`, `/playlist/{id}/tracks`, `/search?q=`. Fields used: `title_short`, `artist.name`, `preview`, `explicit_lyrics`, `album.release_date` / cover.
- Preview URLs expire, so fetch a fresh one right before each round. Never cache them for long.
- Each mix (THROWBACKS, 80s, 90s, 2000s, TODAY) maps to one or more Deezer playlist IDs, picked in M2.
- **Question generator:** pick an unused track with a preview; pick 3 wrong options from the same mix with different artists and different titles; shuffle; never repeat a track within a game.
- Review the terms before any commercial use.

---

## 8. Build order

Each milestone ends with something you can try. Don't start the next one until the check passes.

| # | Milestone | Done when |
|---|---|---|
| M0 | Workspace scaffold (`shared`/`server`/`client`), TypeScript strict, lint, test runner, `render.yaml` + Vercel config | `npm run dev` serves a blank page and the ws echo works |
| M1 | Design system + static screens | Round TV and phone match the canvas side by side; tokens and components from section 4 exist |
| M2 | Music + single-player round | Desktop plays a real 15s clip through `/audio`, shows 4 options, scores with section 6, reveals |
| M3 | Rooms + party mode | TV hosts, sound gate works, 2+ phones join by code, pick initials, ready up, host starts, full 10-round game on TV + phones |
| M4 | Reveal, game over, replay | All 3 reveal phone states, awards, vote → replay or lobby |
| M5 | Remote + public | `sound: "all"` rooms work with no TV; public room runs nonstop sets with top 10 + your row |
| M6 | Resilience | Reconnect within 60s keeps seat/score, host handoff, TV drop pauses, late join, initials dedupe + blocklist |
| M7 | Polish | Glitch reveal, rewind transition, reduce effects, options screen, share score card, sound effects, a11y pass |
| M8 | Ship | Website live on Vercel, server live on Render, both domains connected, warm-up screen works, basic rate limits on joins/guesses |

M8 limits (`server/src/limits.ts`, per IP via Cloudflare's `cf-connecting-ip`): 40 open sockets, 60 new sockets then 1/s, 30 join/resume/create/solo tries then 1 per 3 s, 150 audio requests then 4/s; per connection 40 messages then 10/s, closed after 200 dropped. One Wi-Fi party (TV + 8 phones) stays far below all of them.

---

## 9. Testing

- **Unit:** scoring (section 6 examples), question generator (no repeats, 4 unique options, answer evenly spread across A–D), initials dedupe/blocklist, room state machine transitions.
- **Integration:** a script that opens 1 TV + 6 fake phone sockets, plays a full game, and asserts the board totals.
- **Manual device pass every milestone from M3:** iPhone Safari (audio unlock!), Android Chrome, a laptop as the TV, and if possible a real smart-TV browser.

---

## 10. Defaults and open items

Defaults (chosen; the owner can override any time):
- **Mix playlists:** Claude picks public Deezer playlists for each mix in M2 and lists their IDs in `server/music/mixes.ts`.
- **Initials blocklist:** a standard open-source profanity list, filtered down to 3-letter entries.
- **"Today's best"** is a rolling 24 hours (the server can't know each viewer's midnight).
- **Non-commercial project:** Deezer terms are reviewed again only if that changes.

Open (needed from the owner later):
- **M3:** test on real phones (iPhone Safari especially) on the same Wi-Fi as the dev laptop.
- **M8:** a Render account (sign up with GitHub). DNS for `bhanusadhu.com` is on Vercel, so both domain records are added there.
