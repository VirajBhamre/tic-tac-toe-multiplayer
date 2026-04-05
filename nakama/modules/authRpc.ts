/// <reference types="nakama-runtime" />

import {
  readUsernameOnboarded,
  writeUsernameOnboarded,
} from "../lib/profileFlags";

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

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
      const anyV = v as { length?: number };
      if (typeof anyV.length === "number" && anyV.length >= 0) {
        return new TextDecoder().decode(new Uint8Array(v as ArrayBufferView));
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
    // Nakama JS runtime: if arg 3 is empty/undefined it calls generateUsername(),
    // which breaks email login. Pass the account username from the DB (always set).
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
