// Loose song-name matching, so the same song lines up across Deezer, Apple and MusicBrainz.

/** Lowercase letters and digits only, accents dropped ("JAŸ-Z" → "jay z"). */
export const norm = (s: string): string =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** The title without "(feat. …)", "[Remastered]", " - Single Edit", ", Pt. 1" and the like. */
export function baseTitle(title: string): string {
  const stripped = title
    .replace(/\s*[([].*?[)\]]/g, '')
    .replace(/\s+-\s+.*$/, '')
    .replace(/,?\s+pt\.?\s*\d+$/i, '')
    .trim();
  return stripped || title;
}

/** The lead artist of a credit like "Zach Bryan & Lana Del Rey" or "Drake feat. Future". */
export function primaryArtist(artist: string): string {
  return artist.split(/\s*(?:,|&|\bfeat\.?|\bft\.?|\bfeaturing\b|\bwith\b)\s*/i)[0]!.trim() || artist;
}

/** Key for the same song under slightly different spellings. */
export const songKey = (artist: string, title: string): string => `${norm(artist)}|${norm(baseTitle(title))}`;
