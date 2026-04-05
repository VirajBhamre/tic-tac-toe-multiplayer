/// <reference types="nakama-runtime" />

import {
  countLeaderboardRecords,
  getLeaderboardEloRankForUser,
  listLeaderboardRecordsSql,
} from "../lib/leaderboardQuery";
import {
  readUsernameOnboarded,
  writeUsernameOnboarded,
} from "../lib/profileFlags";
import { ensurePlayerStats } from "../lib/statsStorage";
import { ensureRatingProfile, readRatingRecord } from "../lib/ratingStorage";
import { LEADERBOARD_WINS_ID, MATCH_MODULE_NAME } from "../match/constants";

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

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

function normalizeIdentifier(raw: string): string {
  return raw.trim();
}

/** sqlQuery may return []byte for text columns in some drivers. */
function sqlCellString(v: unknown): string {
  if (v == null) {
    return "";
  }
  if (typeof v === "string") {
    return v;
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    return String(v);
  }
  if (typeof v === "object" && v !== null) {
    try {
      if (v instanceof Uint8Array) {
        return new TextDecoder().decode(v);
      }
      const view = v as ArrayBufferView;
      if (typeof view.byteLength === "number" && view.byteLength >= 0) {
        return new TextDecoder().decode(
          new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
        );
      }
    } catch {
      /* fall through */
    }
  }
  return String(v);
}

function resolveEmailForIdentifier(
  nk: nkruntime.Nakama,
  identifier: string
): { email: string; userId: string; username: string } | null {
  const id = normalizeIdentifier(identifier);
  if (!id) {
    return null;
  }
  if (id.includes("@")) {
    const sql = `
SELECT id::text, email, username
FROM users
WHERE LOWER(email) = LOWER($1)
LIMIT 1
`;
    const rows = nk.sqlQuery(sql, [id]) as Record<string, unknown>[];
    if (!rows || rows.length === 0) {
      return null;
    }
    const row = rows[0];
    const email = sqlCellString(row.email).trim();
    if (!email) {
      return null;
    }
    return {
      email,
      userId: sqlCellString(row.id),
      username: sqlCellString(row.username),
    };
  }
  const sqlUser = `
SELECT id::text, email, username
FROM users
WHERE LOWER(username) = LOWER($1)
LIMIT 1
`;
  const rows = nk.sqlQuery(sqlUser, [id]) as Record<string, unknown>[];
  if (!rows || rows.length === 0) {
    return null;
  }
  const row = rows[0];
  const email = sqlCellString(row.email).trim();
  if (!email) {
    return null;
  }
  return {
    email,
    userId: sqlCellString(row.id),
    username: sqlCellString(row.username),
  };
}

/**
 * Unauthenticated RPC (call with HTTP key). Returns session token for email auth.
 */
export function signInWithIdentifier(
  _ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  let identifier = "";
  let password = "";
  try {
    const b = JSON.parse(payload || "{}") as {
      identifier?: string;
      password?: string;
    };
    identifier = typeof b.identifier === "string" ? b.identifier : "";
    password = typeof b.password === "string" ? b.password : "";
  } catch {
    return JSON.stringify({
      ok: false,
      message: "Invalid request.",
    });
  }
  if (!normalizeIdentifier(identifier) || !password) {
    return JSON.stringify({
      ok: false,
      message: "Invalid identifier or password.",
    });
  }
  const resolved = resolveEmailForIdentifier(nk, identifier);
  if (!resolved) {
    return JSON.stringify({
      ok: false,
      message: "Invalid identifier or password.",
    });
  }
  try {
    const uname = resolved.username.trim();
    if (!uname) {
      return JSON.stringify({
        ok: false,
        message: "Invalid identifier or password.",
      });
    }
    const auth = nk.authenticateEmail(resolved.email, password, uname, false);
    const tok = nk.authenticateTokenGenerate(auth.userId, auth.username);
    return JSON.stringify({
      ok: true,
      token: tok.token,
      exp: tok.exp,
      created: auth.created,
    });
  } catch {
    return JSON.stringify({
      ok: false,
      message: "Invalid identifier or password.",
    });
  }
}

export function getProfileStatus(
  ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  _payload: string
): string {
  if (!ctx.userId) {
    throw new Error("unauthorized");
  }
  const onboarded = readUsernameOnboarded(nk, ctx.userId);
  return JSON.stringify({ needsUsernameSetup: !onboarded });
}

export function checkUsernameAvailable(
  ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx.userId) {
    throw new Error("unauthorized");
  }
  let username = "";
  try {
    const b = JSON.parse(payload || "{}") as { username?: string };
    username = typeof b.username === "string" ? b.username.trim() : "";
  } catch {
    return JSON.stringify({ available: false, reason: "invalid_json" });
  }
  if (!USERNAME_RE.test(username)) {
    return JSON.stringify({ available: false, reason: "invalid_format" });
  }
  const sql = `
SELECT id::text FROM users
WHERE LOWER(username) = LOWER($1) AND id != $2::uuid
LIMIT 1
`;
  const rows = nk.sqlQuery(sql, [username, ctx.userId]) as Record<
    string,
    unknown
  >[];
  const taken = rows && rows.length > 0;
  return JSON.stringify({ available: !taken });
}

/**
 * Sets account username (validated) and marks onboarding complete.
 */
export function setUsernameAndOnboard(
  ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx.userId) {
    throw new Error("unauthorized");
  }
  let username = "";
  try {
    const b = JSON.parse(payload || "{}") as { username?: string };
    username = typeof b.username === "string" ? b.username.trim() : "";
  } catch {
    throw new Error("invalid_json");
  }
  if (!USERNAME_RE.test(username)) {
    throw new Error(
      "username_invalid_use_3_20_chars_letters_numbers_underscore"
    );
  }
  const sql = `
SELECT id::text FROM users
WHERE LOWER(username) = LOWER($1) AND id != $2::uuid
LIMIT 1
`;
  const clash = nk.sqlQuery(sql, [username, ctx.userId]) as Record<
    string,
    unknown
  >[];
  if (clash && clash.length > 0) {
    throw new Error("username_taken");
  }
  nk.accountUpdateId(ctx.userId, username, null, null, null, null, null, null);
  writeUsernameOnboarded(nk, ctx.userId);
  return JSON.stringify({ ok: true });
}

const MIN_PASSWORD_LEN = 8;

/**
 * Email accounts only: verifies current password via authenticateEmail, then stores bcrypt hash.
 */
export function changePassword(
  ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx.userId) {
    throw new Error("unauthorized");
  }
  let oldPassword = "";
  let newPassword = "";
  try {
    const b = JSON.parse(payload || "{}") as {
      oldPassword?: string;
      newPassword?: string;
    };
    oldPassword =
      typeof b.oldPassword === "string" ? b.oldPassword : "";
    newPassword =
      typeof b.newPassword === "string" ? b.newPassword : "";
  } catch {
    throw new Error("invalid_json");
  }
  if (!oldPassword || !newPassword) {
    throw new Error("missing_fields");
  }
  if (newPassword.length < MIN_PASSWORD_LEN) {
    throw new Error("password_too_short");
  }
  const acc = nk.accountGetId(ctx.userId);
  const email = (acc.email ?? "").trim();
  if (!email) {
    throw new Error("email_account_required");
  }
  const uname = (acc.user.username ?? "").trim();
  if (!uname) {
    throw new Error("account_incomplete");
  }
  try {
    nk.authenticateEmail(email, oldPassword, uname, false);
  } catch {
    throw new Error("invalid_old_password");
  }
  const hash = nk.bcryptHash(newPassword);
  nk.sqlExec(
    `UPDATE users SET password = convert_to($1, 'UTF8'), update_time = now() WHERE id = $2::uuid`,
    [hash, ctx.userId]
  );
  return JSON.stringify({ ok: true });
}

/**
 * Lightweight RPC for uptime monitors (e.g. Render free tier) and optional self-ping.
 * Call over HTTP: POST /v2/rpc/ping?http_key=...&unwrap= with body "{}".
 */
export function ping(
  _ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  _payload: string
): string {
  return JSON.stringify({ ok: true });
}
