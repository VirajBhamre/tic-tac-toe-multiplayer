/// <reference types="nakama-runtime" />

import {
  defaultPlayerStats,
  normalizePlayerStats,
  type PlayerStats,
} from "../match/statsLogic";

const COLLECTION = "tic_tac_toe_stats";
const KEY = "career";

export function readPlayerStats(
  nk: nkruntime.Nakama,
  userId: string
): PlayerStats {
  const objs = nk.storageRead([
    { collection: COLLECTION, key: KEY, userId },
  ]);
  if (!objs || objs.length === 0) {
    return defaultPlayerStats();
  }
  return normalizePlayerStats(objs[0].value as Record<string, unknown>);
}

export function writePlayerStats(
  nk: nkruntime.Nakama,
  userId: string,
  stats: PlayerStats
): void {
  nk.storageWrite([
    {
      collection: COLLECTION,
      key: KEY,
      userId,
      value: {
        wins: stats.wins,
        losses: stats.losses,
        draws: stats.draws,
        winStreak: stats.winStreak,
      },
      permissionRead: 1,
      permissionWrite: 1,
    },
  ]);
}

export function ensurePlayerStats(
  nk: nkruntime.Nakama,
  userId: string
): PlayerStats {
  const objs = nk.storageRead([
    { collection: COLLECTION, key: KEY, userId },
  ]);
  if (objs && objs.length > 0) {
    return normalizePlayerStats(objs[0].value as Record<string, unknown>);
  }
  const initial = defaultPlayerStats();
  writePlayerStats(nk, userId, initial);
  return initial;
}
