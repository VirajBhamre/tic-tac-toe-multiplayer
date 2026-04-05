/// <reference types="nakama-runtime" />

import {
  countLeaderboardRecords,
  getLeaderboardEloRankForUser,
  listLeaderboardRecordsSql,
} from "../lib/leaderboardQuery";
import { readUsernameOnboarded } from "../lib/profileFlags";
import { ensurePlayerStats } from "../lib/statsStorage";
import { ensureRatingProfile, readRatingRecord } from "../lib/ratingStorage";
import {
  LEADERBOARD_WINS_ID,
  MATCH_MODULE_NAME,
} from "../match/tictactoe";

function parseRated(payload: string): boolean {
  try {
    const body = JSON.parse(payload || "{}") as { rated?: boolean };
    if (body && body.rated === false) {
      return false;
    }
  } catch {
    /* default rated */
  }
  return true;
}

function parseCreateBody(payload: string): {
  rated: boolean;
  mode: "classic" | "timed";
  moveTimeLimitSec: number;
} {
  let rated = true;
  let mode: "classic" | "timed" = "classic";
  let moveTimeLimitSec = 30;
  try {
    const body = JSON.parse(payload || "{}") as {
      rated?: boolean;
      mode?: string;
      moveTimeLimitSec?: number;
    };
    if (body && body.rated === false) {
      rated = false;
    }
    if (body?.mode === "timed") {
      mode = "timed";
    }
    if (
      typeof body?.moveTimeLimitSec === "number" &&
      Number.isFinite(body.moveTimeLimitSec)
    ) {
      moveTimeLimitSec = body.moveTimeLimitSec;
    }
  } catch {
    /* defaults */
  }
  return { rated, mode, moveTimeLimitSec };
}

function requireUsernameOnboarded(
  nk: nkruntime.Nakama,
  userId: string
): void {
  if (!readUsernameOnboarded(nk, userId)) {
    throw new Error("username_onboarding_required");
  }
}

export function createMatch(
  ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx.userId) {
    throw new Error("unauthorized");
  }
  requireUsernameOnboarded(nk, ctx.userId);
  ensureRatingProfile(nk, ctx.userId);
  ensurePlayerStats(nk, ctx.userId);
  const { rated, mode, moveTimeLimitSec } = parseCreateBody(payload);
  const matchId = nk.matchCreate(MATCH_MODULE_NAME, {
    rated,
    mode,
    moveTimeLimitSec,
    source: "manual",
  });
  return JSON.stringify({ matchId });
}

export function getRating(
  ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  _payload: string
): string {
  if (!ctx.userId) {
    throw new Error("unauthorized");
  }
  const rec = ensureRatingProfile(nk, ctx.userId);
  return JSON.stringify({
    rating: rec.rating,
    gamesPlayed: rec.gamesPlayed,
  });
}

export function joinMatch(
  ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx.userId) {
    throw new Error("unauthorized");
  }
  requireUsernameOnboarded(nk, ctx.userId);
  ensureRatingProfile(nk, ctx.userId);
  ensurePlayerStats(nk, ctx.userId);
  let body: { matchId?: string };
  try {
    body = JSON.parse(payload || "{}");
  } catch {
    throw new Error("invalid_json");
  }
  if (!body.matchId || typeof body.matchId !== "string") {
    throw new Error("matchId_required");
  }
  return JSON.stringify({ ok: true, matchId: body.matchId });
}

export function listOpenMatches(
  ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx.userId) {
    throw new Error("unauthorized");
  }
  let modeFilter: "classic" | "timed" | null = null;
  try {
    const b = JSON.parse(payload || "{}") as { mode?: string };
    if (b.mode === "classic" || b.mode === "timed") {
      modeFilter = b.mode;
    }
  } catch {
    /* any */
  }
  const listed = nk.matchList(50, true, null, 1, 1, null);
  const open: {
    matchId: string;
    size: number;
    mode: string;
    open: number;
  }[] = [];
  for (const m of listed) {
    let label: { open?: number; name?: string; mode?: string };
    try {
      label = JSON.parse(m.label) as {
        open?: number;
        name?: string;
        mode?: string;
      };
    } catch {
      continue;
    }
    if (label.open !== 1 || label.name !== MATCH_MODULE_NAME) {
      continue;
    }
    if (modeFilter && label.mode !== modeFilter) {
      continue;
    }
    open.push({
      matchId: m.matchId,
      size: m.size,
      mode: label.mode || "classic",
      open: label.open,
    });
  }
  return JSON.stringify({ matches: open });
}

export function getLeaderboard(
  ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx.userId) {
    throw new Error("unauthorized");
  }
  let limit = 100;
  let offset = 0;
  try {
    const b = JSON.parse(payload || "{}") as {
      limit?: number;
      offset?: number;
    };
    if (typeof b.limit === "number" && b.limit >= 1 && b.limit <= 100) {
      limit = Math.floor(b.limit);
    }
    if (typeof b.offset === "number" && b.offset >= 0 && b.offset <= 100000) {
      offset = Math.floor(b.offset);
    }
  } catch {
    /* defaults */
  }
  const totalCount = countLeaderboardRecords(nk, LEADERBOARD_WINS_ID);
  const rows = listLeaderboardRecordsSql(
    nk,
    LEADERBOARD_WINS_ID,
    limit,
    offset
  );
  const records = rows.map((r) => {
    const rating = readRatingRecord(nk, r.userId).rating;
    return {
      rank: r.rank,
      userId: r.userId,
      username: r.username,
      rating,
      wins: r.wins,
      winStreak: r.winStreak,
      losses: r.losses,
      draws: r.draws,
    };
  });
  return JSON.stringify({
    records,
    totalCount,
    limit,
    offset,
    hasMore: offset + records.length < totalCount,
  });
}

export function getMyStats(
  ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  _payload: string
): string {
  if (!ctx.userId) {
    throw new Error("unauthorized");
  }
  const stats = ensurePlayerStats(nk, ctx.userId);
  let rank = 0;
  try {
    rank = getLeaderboardEloRankForUser(nk, LEADERBOARD_WINS_ID, ctx.userId);
  } catch {
    rank = 0;
  }
  return JSON.stringify({ stats, rank });
}
