/// <reference types="nakama-runtime" />

import { DEFAULT_RATING } from "../match/ratingLogic";

/**
 * Reads leaderboard rows via SQL to avoid Nakama's JS leaderboardRecordToJsMap,
 * which panics on records whose metadata is not valid JSON (breaking list + RPCs).
 */
export type SqlLeaderboardRow = {
  rank: number;
  userId: string;
  username: string;
  wins: number;
  winStreak: number;
  losses: number;
  draws: number;
};

function parseMetadata(raw: unknown): { losses: number; draws: number } {
  if (raw == null) {
    return { losses: 0, draws: 0 };
  }
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    const maybeByteLen = (raw as { byteLength?: unknown }).byteLength;
    if (typeof maybeByteLen === "number" && maybeByteLen >= 0) {
      try {
        const s = new TextDecoder().decode(raw as Uint8Array).trim();
        if (!s || s === "null") {
          return { losses: 0, draws: 0 };
        }
        raw = JSON.parse(s) as unknown;
      } catch {
        return { losses: 0, draws: 0 };
      }
    }
  }
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s || s === "null") {
      return { losses: 0, draws: 0 };
    }
    try {
      raw = JSON.parse(s) as unknown;
    } catch {
      return { losses: 0, draws: 0 };
    }
  }
  if (!raw || typeof raw !== "object") {
    return { losses: 0, draws: 0 };
  }
  const m = raw as Record<string, unknown>;
  const losses =
    typeof m.losses === "number" && Number.isFinite(m.losses)
      ? Math.floor(m.losses)
      : 0;
  const draws =
    typeof m.draws === "number" && Number.isFinite(m.draws)
      ? Math.floor(m.draws)
      : 0;
  return { losses, draws };
}

function coerceInt(n: unknown): number {
  if (typeof n === "number" && Number.isFinite(n)) {
    return Math.floor(n);
  }
  if (typeof n === "string") {
    const v = parseInt(n, 10);
    return Number.isFinite(v) ? v : 0;
  }
  return 0;
}

function coerceUuid(n: unknown): string {
  if (typeof n === "string") {
    return n;
  }
  return String(n ?? "");
}

export function countLeaderboardRecords(
  nk: nkruntime.Nakama,
  leaderboardId: string
): number {
  const sql = `
SELECT COUNT(*)::bigint AS c
FROM leaderboard_record
WHERE leaderboard_id = $1
`;
  const rows = nk.sqlQuery(sql, [leaderboardId]) as Record<string, unknown>[];
  if (!rows || rows.length === 0) {
    return 0;
  }
  return coerceInt(rows[0].c);
}

/**
 * Paged leaderboard rows. `rank` is global position (1-based) for this page.
 * Ordering is by Elo (`tic_tac_toe_rating` storage), then `update_time` for ties.
 */
export function listLeaderboardRecordsSql(
  nk: nkruntime.Nakama,
  leaderboardId: string,
  limit: number,
  offset: number
): SqlLeaderboardRow[] {
  const safeLimit = Math.max(0, Math.floor(limit));
  const safeOffset = Math.max(0, Math.floor(offset));
  const defaultElo = DEFAULT_RATING;
  const sql = `
SELECT q.owner_id, q.username, q.score, q.subscore, q.metadata
FROM (
  SELECT lr.owner_id,
    COALESCE(NULLIF(TRIM(u.username), ''), lr.username, '') AS username,
    lr.score, lr.subscore, lr.metadata, lr.update_time,
    COALESCE(
      (NULLIF(trim(COALESCE(rt.value->>'rating', '')), ''))::double precision,
      ${defaultElo}::double precision
    ) AS sort_elo
  FROM leaderboard_record lr
  LEFT JOIN users u ON u.id = lr.owner_id
  LEFT JOIN storage rt ON rt.user_id = lr.owner_id
    AND rt.collection = 'tic_tac_toe_rating'
    AND rt.key = 'stats'
  WHERE lr.leaderboard_id = $1
) q
ORDER BY q.sort_elo DESC, q.update_time ASC
LIMIT $2 OFFSET $3
`;
  const rows = nk.sqlQuery(sql, [
    leaderboardId,
    safeLimit,
    safeOffset,
  ]) as Record<string, unknown>[];
  const out: SqlLeaderboardRow[] = [];
  let rank = safeOffset;
  for (const row of rows) {
    rank += 1;
    const meta = parseMetadata(row.metadata);
    out.push({
      rank,
      userId: coerceUuid(row.owner_id),
      username:
        typeof row.username === "string"
          ? row.username
          : String(row.username ?? ""),
      wins: coerceInt(row.score),
      winStreak: coerceInt(row.subscore),
      losses: meta.losses,
      draws: meta.draws,
    });
  }
  return out;
}

/** 1-based rank by Elo among rows on this leaderboard, or 0 if the user has no record. */
export function getLeaderboardEloRankForUser(
  nk: nkruntime.Nakama,
  leaderboardId: string,
  userId: string
): number {
  const defaultElo = DEFAULT_RATING;
  const sql = `
SELECT pos::bigint AS r FROM (
  SELECT lr.owner_id,
    ROW_NUMBER() OVER (
      ORDER BY COALESCE(
        (NULLIF(trim(COALESCE(rt.value->>'rating', '')), ''))::double precision,
        ${defaultElo}::double precision
      ) DESC,
      lr.update_time ASC
    ) AS pos
  FROM leaderboard_record lr
  LEFT JOIN storage rt ON rt.user_id = lr.owner_id
    AND rt.collection = 'tic_tac_toe_rating'
    AND rt.key = 'stats'
  WHERE lr.leaderboard_id = $1
) ranked
WHERE ranked.owner_id = $2::uuid
LIMIT 1
`;
  const rows = nk.sqlQuery(sql, [leaderboardId, userId]) as Record<
    string,
    unknown
  >[];
  if (!rows || rows.length === 0) {
    return 0;
  }
  return coerceInt(rows[0].r);
}
