/// <reference types="nakama-runtime" />

import {
  DEFAULT_RATING,
  type RatingRecord,
} from "../match/ratingLogic";

const COLLECTION = "tic_tac_toe_rating";
const KEY = "stats";

export function readRatingRecord(
  nk: nkruntime.Nakama,
  userId: string
): RatingRecord {
  const objs = nk.storageRead([
    { collection: COLLECTION, key: KEY, userId },
  ]);
  if (!objs || objs.length === 0) {
    return { rating: DEFAULT_RATING, gamesPlayed: 0 };
  }
  const v = objs[0].value as Record<string, unknown>;
  const rating =
    typeof v.rating === "number" && Number.isFinite(v.rating)
      ? v.rating
      : DEFAULT_RATING;
  const gamesPlayed =
    typeof v.gamesPlayed === "number" && Number.isFinite(v.gamesPlayed)
      ? Math.max(0, Math.floor(v.gamesPlayed))
      : 0;
  return { rating, gamesPlayed };
}

export function writeRatingRecord(
  nk: nkruntime.Nakama,
  userId: string,
  record: RatingRecord
): void {
  nk.storageWrite([
    {
      collection: COLLECTION,
      key: KEY,
      userId,
      value: {
        rating: record.rating,
        gamesPlayed: record.gamesPlayed,
      },
      permissionRead: 1,
      permissionWrite: 1,
    },
  ]);
}

/** Persist default profile so ratings are tracked in storage. */
export function ensureRatingProfile(
  nk: nkruntime.Nakama,
  userId: string
): RatingRecord {
  const objs = nk.storageRead([
    { collection: COLLECTION, key: KEY, userId },
  ]);
  if (objs && objs.length > 0) {
    const v = objs[0].value as Record<string, unknown>;
    const rating =
      typeof v.rating === "number" && Number.isFinite(v.rating)
        ? v.rating
        : DEFAULT_RATING;
    const gamesPlayed =
      typeof v.gamesPlayed === "number" && Number.isFinite(v.gamesPlayed)
        ? Math.max(0, Math.floor(v.gamesPlayed))
        : 0;
    return { rating, gamesPlayed };
  }
  const initial: RatingRecord = {
    rating: DEFAULT_RATING,
    gamesPlayed: 0,
  };
  writeRatingRecord(nk, userId, initial);
  return initial;
}
