/**
 * Pure career stats updates (wins / losses / draws / win streak). No Nakama imports.
 */

export interface PlayerStats {
  wins: number;
  losses: number;
  draws: number;
  winStreak: number;
}

export function defaultPlayerStats(): PlayerStats {
  return { wins: 0, losses: 0, draws: 0, winStreak: 0 };
}

export function normalizePlayerStats(raw: Record<string, unknown>): PlayerStats {
  const num = (v: unknown, d: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : d;
  return {
    wins: num(raw.wins, 0),
    losses: num(raw.losses, 0),
    draws: num(raw.draws, 0),
    winStreak: num(raw.winStreak, 0),
  };
}

/**
 * Apply one game outcome to a single player's career totals.
 */
export function mergeResultIntoStats(
  stats: PlayerStats,
  outcome: "win" | "loss" | "draw"
): PlayerStats {
  switch (outcome) {
    case "win":
      return {
        wins: stats.wins + 1,
        losses: stats.losses,
        draws: stats.draws,
        winStreak: stats.winStreak + 1,
      };
    case "loss":
      return {
        wins: stats.wins,
        losses: stats.losses + 1,
        draws: stats.draws,
        winStreak: 0,
      };
    case "draw":
      return {
        wins: stats.wins,
        losses: stats.losses,
        draws: stats.draws + 1,
        winStreak: 0,
      };
    default:
      return stats;
  }
}

/**
 * Map both players' outcomes from a finished two-player game.
 */
export function outcomesForFinishedGame(
  playerA: string,
  playerB: string,
  winner: string | null
): { a: "win" | "loss" | "draw"; b: "win" | "loss" | "draw" } {
  if (winner === null) {
    return { a: "draw", b: "draw" };
  }
  if (winner === playerA) {
    return { a: "win", b: "loss" };
  }
  if (winner === playerB) {
    return { a: "loss", b: "win" };
  }
  return { a: "draw", b: "draw" };
}
