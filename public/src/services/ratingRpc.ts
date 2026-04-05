import type { Client } from "@heroiclabs/nakama-js";
import type { Session } from "@heroiclabs/nakama-js";

export interface RatingPayload {
  rating: number;
  gamesPlayed: number;
}

export async function rpcGetRating(
  client: Client,
  session: Session
): Promise<RatingPayload> {
  const tryIds = ["getRating", "getrating"];
  let lastErr: unknown;
  for (const id of tryIds) {
    try {
      const res = await client.rpc(session, id, {});
      const p = res.payload as RatingPayload | undefined;
      if (
        p &&
        typeof p.rating === "number" &&
        typeof p.gamesPlayed === "number"
      ) {
        return p;
      }
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("getRating failed");
}
