// Looks up each decade-playlist song's original release year on MusicBrainz and writes src/music/years.json.
// The mixes use it to drop songs from the wrong decade. Re-run when the Deezer playlists change.
// Usage: npm run years -w server [-- --refresh]   (--refresh re-checks songs already in the file)
import { readFileSync, writeFileSync } from 'node:fs';
import { playlistTracks } from '../src/music/deezer';
import { DECADES, inEra } from '../src/music/mixes';
import { baseTitle, norm, songKey } from '../src/music/names';
import { toPool, type PoolTrack } from '../src/music/question';

const FILE = new URL('../src/music/years.json', import.meta.url);
// MusicBrainz asks for a descriptive User-Agent and at most 1 request per second.
const USER_AGENT = 'Replay/1.0 (https://replay.bhanusadhu.com)';
const GAP_MS = 1100;
const refreshAll = process.argv.includes('--refresh');

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Recording {
  title: string;
  'first-release-date'?: string;
  'artist-credit'?: { name: string; joinphrase?: string }[];
}

async function search(query: string): Promise<Recording[]> {
  const url = `https://musicbrainz.org/ws/2/recording?${new URLSearchParams({ query, fmt: 'json', limit: '100' })}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(15_000) });
    if (res.ok) return ((await res.json()) as { recordings: Recording[] }).recordings;
    if (res.status !== 503 || attempt === 4) throw new Error(`MusicBrainz HTTP ${res.status}`);
    await wait(3000 * (attempt + 1)); // Rate limited: back off and retry.
  }
}

/** Checked by hand where MusicBrainz data misleads the rule below (demos, mis-dated entries, covers outranking). */
/** Remixes and re-released songs use the year they were a hit, since that's the version the playlists carry. */
const OVERRIDES: Record<string, number> = {
  'daryl hall john oates|maneater': 1982,
  'bob marley the wailers|redemption song': 1980,
  'alaska y dinarama|ni tu ni nadie': 1985,
  'christopher cross|arthur s theme': 1981,
  'abba|super trouper': 1980,
  'the goo goo dolls|iris': 1998,
  'bon jovi|it s my life': 2000,
  'elvis presley|a little less conversation': 2002, // JXL remix
  'fatman scoop|be faithful': 2003, // 1999 release, a hit in 2003
};

const bareArtist = (artist: string) => norm(artist).replace(/^the /, '');

/**
 * The original year of a song: the earliest year that at least 2 recordings with the same title by the same artist
 * agree on. A lone demo or a mis-dated entry doesn't count, and remasters only add later years.
 * Null when there's too little data to tell.
 */
async function originalYear(track: PoolTrack): Promise<number | null> {
  const title = baseTitle(track.title);
  const quoted = (s: string) => `"${s.replace(/[\\"]/g, '\\$&')}"`;
  const recordings = await search(`recording:${quoted(title)} AND artist:${quoted(track.artist)}`);
  const counts = new Map<number, number>();
  for (const r of recordings) {
    if (norm(baseTitle(r.title)) !== norm(title)) continue;
    const credit = (r['artist-credit'] ?? []).map((c) => c.name + (c.joinphrase ?? '')).join('');
    if (!norm(credit).includes(bareArtist(track.artist))) continue;
    const year = Number(r['first-release-date']?.slice(0, 4));
    if (year > 1900) counts.set(year, (counts.get(year) ?? 0) + 1);
  }
  const agreed = [...counts].filter(([, n]) => n >= 2).map(([year]) => year);
  return agreed.length ? Math.min(...agreed) : null;
}

const known: Record<string, number | null> = JSON.parse(readFileSync(FILE, 'utf8'));
const decades = await Promise.all(
  Object.entries(DECADES).map(async ([decade, { playlists, era }]) => ({
    decade,
    era,
    tracks: toPool((await Promise.all(playlists.map(playlistTracks))).flat()),
  })),
);
const tracks = decades.flatMap((d) => d.tracks);
const result: Record<string, number | null> = {};
let looked = 0;

for (const track of tracks) {
  const key = songKey(track.artist, track.title);
  if (key in result) continue;
  if (key in OVERRIDES) {
    result[key] = OVERRIDES[key]!;
    continue;
  }
  if (!refreshAll && key in known) {
    result[key] = known[key]!;
    continue;
  }
  if (looked++) await wait(GAP_MS);
  try {
    result[key] = await originalYear(track);
    console.log(`${result[key] ?? '????'}  ${track.artist} - ${track.title}`);
  } catch (err) {
    console.warn(`skip  ${track.artist} - ${track.title}: ${(err as Error).message}`);
  }
}

const sorted = Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(FILE, `${JSON.stringify(sorted, null, 2)}\n`);
const missing = Object.values(sorted).filter((y) => y === null).length;
// Songs each decade mix will now leave out: worth a look, and an OVERRIDES entry if the year is wrong.
for (const { decade, era, tracks: list } of decades) {
  const out = list.filter((t) => !inEra(t, era, (key) => sorted[key]));
  console.log(`\n${decade}: leaves out ${out.length} of ${list.length}`);
  for (const t of out) console.log(`  ${sorted[songKey(t.artist, t.title)]}  ${t.artist} - ${t.title}`);
}
console.log(`\n${Object.keys(sorted).length} songs (${looked} looked up, ${missing} without a year) → src/music/years.json`);
