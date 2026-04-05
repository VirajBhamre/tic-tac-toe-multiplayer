/**
 * Pure Elo helpers (chess.com–style K tiers). No Nakama imports.
 */

export const DEFAULT_RATING = 1200;

export interface RatingRecord {
  rating: number;
  gamesPlayed: number;
}

/** Expected score for player A (rating Ra) vs opponent B (Rb). */
export function expectedScore(ra: number, rb: number): number {
  return 1 / (1 + Math.pow(10, (rb - ra) / 400));
}

/**
 * K-factor: higher while provisional (like chess.com), then standard tiers.
 */
export function kFactor(rating: number, gamesPlayed: number): number {
  if (gamesPlayed < 30) {
    return 40;
  }
  if (rating >= 2400) {
    return 10;
  }
  return 20;
}

export interface EloUpdateResult {
  newRatingA: number;
  newRatingB: number;
  newGamesPlayedA: number;
  newGamesPlayedB: number;
}

/**
 * @param scoreA — 1 = A wins, 0.5 = draw, 0 = B wins
 */
export function computeEloUpdate(
  a: RatingRecord,
  b: RatingRecord,
  scoreA: number
): EloUpdateResult {
  const scoreB = 1 - scoreA;
  const ea = expectedScore(a.rating, b.rating);
  const eb = expectedScore(b.rating, a.rating);
  const ka = kFactor(a.rating, a.gamesPlayed);
  const kb = kFactor(b.rating, b.gamesPlayed);
  const newRatingA = Math.round(a.rating + ka * (scoreA - ea));
  const newRatingB = Math.round(b.rating + kb * (scoreB - eb));
  return {
    newRatingA,
    newRatingB,
    newGamesPlayedA: a.gamesPlayed + 1,
    newGamesPlayedB: b.gamesPlayed + 1,
  };
}
