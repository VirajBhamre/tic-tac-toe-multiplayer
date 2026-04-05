import type { Client } from "@heroiclabs/nakama-js";
import type { Session } from "@heroiclabs/nakama-js";

/**
 * Thin wrappers around backend RPCs. IDs match `nakama/modules/main.ts`.
 * Nakama may normalize RPC ids; if one fails, try lowercase (observed in some builds).
 */
export type CreateMatchOptions = {
  rated?: boolean;
  mode?: "classic" | "timed";
  moveTimeLimitSec?: number;
};

export async function rpcCreateMatch(
  client: Client,
  session: Session,
  options?: CreateMatchOptions
): Promise<string> {
  const tryIds = ["createMatch", "creatematch"];
  const payload = {
    rated: options?.rated !== false,
    mode: options?.mode ?? "classic",
    moveTimeLimitSec: options?.moveTimeLimitSec ?? 30,
  };
  let lastErr: unknown;
  for (const id of tryIds) {
    try {
      const res = await client.rpc(session, id, payload);
      const mid = (res.payload as { matchId?: string } | undefined)?.matchId;
      if (mid && typeof mid === "string") return mid;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("createMatch failed");
}

export async function rpcJoinMatchAck(
  client: Client,
  session: Session,
  matchId: string
): Promise<void> {
  const tryIds = ["joinMatch", "joinmatch"];
  let lastErr: unknown;
  for (const id of tryIds) {
    try {
      await client.rpc(session, id, { matchId });
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("joinMatch failed");
}
