# Music sources and refreshes

TODAY uses Apple Music's public US and UK most-played song feeds. The server keeps songs released within the past two years, removes duplicate titles by lead artist, and limits each lead artist to three songs. It looks up each song through Deezer's public search API and accepts a playable clip only when the lead artist, title and recording match. Alternate recordings such as live takes or remixes need a matching full title. Apple supplies the release year and genre for this mix.

Apple feeds without a valid update date, more than 48 hours old, or dated more than five minutes into the future are rejected. Future song releases are excluded. An unavailable feed can be covered by the other storefront. TODAY never falls back to Deezer's general chart, which can contain decades-old songs.

The decade mixes use two Deezer editorial playlists per decade. One healthy playlist can cover its unavailable companion. THROWBACKS requires a result from each of the three decades. Simultaneous decade and THROWBACKS loads share playlist requests. Known original release years from the checked-in MusicBrainz lookup remove songs outside the requested era; unknown years remain eligible.

## Outages

Each mix refreshes on demand after an hour. A refresh must produce at least 20 unique playable tracks before replacing the cached selection. The longest room game has 15 rounds, leaving room for wrong options and some unavailable clips. Failed and thin refreshes retain the last good pool and wait five minutes before trying again. A pool older than 24 hours must refresh successfully before starting a new game. Existing games keep their selection.

The cache is in memory. A fresh deployment needs working sources to load its first selection; there is no saved fallback presented as a live chart. `/health` remains a server liveness check and includes per-mix `ready`, `tracks`, `loadedAt` and `refreshing` fields, plus Render's deployed commit as `revision`. A live process can therefore report `ok: true` while a music source is still warming or unavailable.

## Clip delivery

Each round refreshes the selected track's preview URL and checks that it is still readable. Downloads have an eight-second timeout and a 2 MiB size cap, including streamed responses without a content length. The response must have an audio or generic binary type and contain an MP3 frame after any ID3 tag. This detects empty bodies, HTML error pages and obviously invalid responses; it does not fully decode the recording. A rejected clip is skipped using the game's existing five-attempt preparation limit.

## Provider choices

These requests use the existing public feeds and public Deezer endpoints without a new paid service or API key. Spotify is not a source: its [developer policy](https://developer.spotify.com/policy) excludes games, including trivia quizzes. Apple's [RSS generator](https://rss.marketingtools.apple.com/) supplies the chart feed URLs.

## Checks

`npm run check` covers feed freshness, matching, partial playlist failures, cache retention, retry backoff, expired selections and invalid audio responses alongside the game tests. `npm run simulate -w server -- ws://localhost:8787/ws` plays a five-round TODAY game with one TV and six simulated phones against a running server and real music sources. Each round checks its audio download and a byte-range response, the path used by mobile Safari.
