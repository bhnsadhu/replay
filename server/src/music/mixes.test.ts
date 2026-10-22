import { describe, expect, it } from 'vitest';
import { inEra } from './mixes';
import { toHits } from './artists';
import { baseTitle, primaryArtist, songKey } from './names';
import { pickMatch, recentSongs } from './today';
import type { DeezerTrack } from './deezer';

describe('names', () => {
  it('strips featured artists and edit labels from titles', () => {
    expect(baseTitle("Hips Don't Lie (feat. Wyclef Jean)")).toBe("Hips Don't Lie");
    expect(baseTitle('Streets of Philadelphia (Single Edit)')).toBe('Streets of Philadelphia');
    expect(baseTitle('Africa - 2017 Remaster')).toBe('Africa');
    expect(baseTitle('(I Just) Died In Your Arms')).toBe('Died In Your Arms');
    expect(baseTitle('Fastlove, Pt. 1')).toBe('Fastlove');
    expect(baseTitle('The Look Of Love, Pt.1')).toBe('The Look Of Love');
  });

  it('keeps the lead artist of a shared credit', () => {
    expect(primaryArtist('Zach Bryan & Lana Del Rey')).toBe('Zach Bryan');
    expect(primaryArtist('KAROL G, Judeline & rusowsky')).toBe('KAROL G');
    expect(primaryArtist('Drake feat. Future')).toBe('Drake');
    expect(primaryArtist('Olivia Rodrigo')).toBe('Olivia Rodrigo');
  });

  it('matches spellings with accents and punctuation', () => {
    expect(songKey('JAŸ-Z', 'Empire State Of Mind')).toBe(songKey('JAY-Z', 'Empire State of Mind'));
  });
});

describe('inEra', () => {
  const years: Record<string, number | null> = {
    [songKey('Toto', 'Africa')]: 1982,
    [songKey('Freddie Mercury', 'Living On My Own')]: 1985,
    [songKey('Unknown', 'Song')]: null,
  };
  const yearOf = (key: string) => years[key];
  const nineties: [number, number] = [1990, 1999];

  it('drops songs released outside the decade', () => {
    expect(inEra({ artist: 'Freddie Mercury', title: 'Living On My Own' }, nineties, yearOf)).toBe(false);
    expect(inEra({ artist: 'Toto', title: 'Africa' }, [1980, 1989], yearOf)).toBe(true);
  });

  it('keeps songs with no known year', () => {
    expect(inEra({ artist: 'Unknown', title: 'Song' }, nineties, yearOf)).toBe(true);
    expect(inEra({ artist: 'New', title: 'Addition' }, nineties, yearOf)).toBe(true);
  });
});

describe('recentSongs', () => {
  const now = Date.parse('2026-10-21');

  it('keeps songs from the last two years, once each', () => {
    const songs = recentSongs(
      [
        { artist: 'Tate McRae', title: 'Housewife', releaseDate: '2026-10-15' },
        { artist: 'Drake', title: 'Best I Ever Had', releaseDate: '2009-02-13' },
        { artist: 'Tate McRae', title: 'Housewife', releaseDate: '2026-10-15' },
        { artist: 'Zach Bryan & Lana Del Rey', title: 'Lies (feat. Lana Del Rey)', releaseDate: '2025-06-01' },
      ],
      now,
    );
    expect(songs.map((s) => s.title)).toEqual(['Housewife', 'Lies (feat. Lana Del Rey)']);
  });

  it('keeps at most 3 songs per lead artist', () => {
    const songs = recentSongs(
      ['A', 'B', 'C', 'D'].map((title) => ({ artist: 'Morgan Wallen', title, releaseDate: '2026-01-01' })),
      now,
    );
    expect(songs.map((s) => s.title)).toEqual(['A', 'B', 'C']);
  });
});

describe('pickMatch', () => {
  const track = (over: Partial<DeezerTrack>): DeezerTrack => ({
    id: 1,
    title_short: 'Lies',
    preview: 'https://cdn/preview.mp3',
    explicit_lyrics: false,
    artist: { id: 10, name: 'Zach Bryan' },
    ...over,
  });
  const song = { artist: 'Zach Bryan & Lana Del Rey', title: 'Lies (feat. Lana Del Rey)', releaseDate: '2025-06-01' };

  it('takes the first playable version of the same song', () => {
    const picked = pickMatch(song, [track({ id: 1, preview: '' }), track({ id: 2, explicit_lyrics: true }), track({ id: 3 })]);
    expect(picked?.id).toBe(2);
  });

  it('rejects other artists, other titles and unplayable tracks', () => {
    expect(pickMatch(song, [track({ artist: { id: 11, name: 'Zach Top' } })])).toBeNull();
    expect(pickMatch(song, [track({ title_short: 'Lies Lies Lies' })])).toBeNull();
    expect(pickMatch(song, [track({ preview: '' })])).toBeNull();
  });
});

describe('toHits', () => {
  const t = (id: number, title: string, extra: Partial<DeezerTrack> = {}): DeezerTrack => ({
    id,
    title_short: title,
    preview: '',
    explicit_lyrics: false,
    artist: { id: 27, name: 'Daft Punk' },
    ...extra,
  });

  it("keeps the artist's own songs, once per title, without live takes or remixes", () => {
    const hits = toHits(27, [
      t(1, 'One More Time'),
      t(2, 'Get Lucky', { title_version: '(Radio Edit - feat. Pharrell Williams)' }),
      t(3, 'Get Lucky', { title_version: '(feat. Pharrell Williams)' }),
      t(4, 'Around the World', { title_version: '(Live)' }),
      t(5, 'Something About Us (Remix)'),
      t(6, 'Collab', { artist: { id: 99, name: 'Someone Else' } }),
      t(7, 'Veridis Quo'),
    ]);
    expect(hits.map((h) => h.title)).toEqual(['One More Time', 'Get Lucky', 'Veridis Quo']);
  });
});
