import type { Client } from "@heroiclabs/nakama-js";
import type { Session } from "@heroiclabs/nakama-js";

export interface OpenMatchRow {
  matchId: string;
  size: number;
  mode: string;
  open: number;
}

export const LEADERBOARD_PAGE_SIZE = 100;

export interface LeaderboardRow {
  rank: number;
  userId: string;
  username: string;
  rating?: number;
  wins: number;
  winStreak: number;
  losses: number;
  draws: number;
}

export interface LeaderboardPageResult {
  records: LeaderboardRow[];
  totalCount: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface MyCareerPayload {
  stats: {
    wins: number;
    losses: number;
    draws: number;
    winStreak: number;
  };
  rank: number;
}

const EMPTY_CAREER: MyCareerPayload = {
  stats: { wins: 0, losses: 0, draws: 0, winStreak: 0 },
  rank: 0,
};

function isNotFound(e: unknown): boolean {
  return e instanceof Response && e.status === 404;
}

/**
 * Nakama returns 404 when an RPC id is not registered (e.g. server not restarted
 * after deploying a new bundle). Empty leaderboard / no open matches are 200
 * with empty arrays — not 404.
 */
export async function rpcListOpenMatches(
  client: Client,
  session: Session,
  mode?: "classic" | "timed" | "any"
): Promise<OpenMatchRow[]> {
  const payload = mode && mode !== "any" ? { mode } : {};
  const tryIds = ["listopenmatches", "listOpenMatches"];
  let saw404 = false;
  for (const id of tryIds) {
    try {
      const res = await client.rpc(session, id, payload);
      const rows = (res.payload as { matches?: OpenMatchRow[] })?.matches;
      if (Array.isArray(rows)) {
        return rows;
      }
    } catch (e) {
      if (isNotFound(e)) {
        saw404 = true;
        continue;
      }
    }
  }
  if (saw404) {
    return [];
  }
  return [];
}

export async function rpcGetLeaderboard(
  client: Client,
  session: Session,
  opts?: { limit?: number; offset?: number }
): Promise<LeaderboardPageResult> {
  const tryIds = ["getleaderboard", "getLeaderboard"];
  const payload = {
    limit: opts?.limit ?? LEADERBOARD_PAGE_SIZE,
    offset: opts?.offset ?? 0,
  };
  const empty: LeaderboardPageResult = {
    records: [],
    totalCount: 0,
    limit: payload.limit,
    offset: payload.offset,
    hasMore: false,
  };
  for (const id of tryIds) {
    try {
      const res = await client.rpc(session, id, payload);
      const p = res.payload as {
        records?: LeaderboardRow[];
        totalCount?: number;
        limit?: number;
        offset?: number;
        hasMore?: boolean;
      };
      if (p && Array.isArray(p.records)) {
        return {
          records: p.records,
          totalCount:
            typeof p.totalCount === "number" ? p.totalCount : p.records.length,
          limit: typeof p.limit === "number" ? p.limit : payload.limit,
          offset: typeof p.offset === "number" ? p.offset : payload.offset,
          hasMore: Boolean(p.hasMore),
        };
      }
    } catch (e) {
      if (isNotFound(e)) {
        continue;
      }
    }
  }
  return empty;
}

export async function rpcGetMyStats(
  client: Client,
  session: Session
): Promise<MyCareerPayload> {
  const tryIds = ["getmystats", "getMyStats"];
  for (const id of tryIds) {
    try {
      const res = await client.rpc(session, id, {});
      const p = res.payload as MyCareerPayload | undefined;
      if (p?.stats && typeof p.rank === "number") {
        return p;
      }
    } catch (e) {
      if (isNotFound(e)) {
        continue;
      }
    }
  }
  return EMPTY_CAREER;
}
