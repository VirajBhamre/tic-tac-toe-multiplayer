/// <reference types="nakama-runtime" />

import { MATCH_MODULE_NAME } from "../match/tictactoe";

/**
 * Creates an authoritative match when the Nakama matchmaker pairs players.
 * Clients must join using the returned match id and the matchmaker token.
 */
export function matchmakerMatched(
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  matches: nkruntime.MatchmakerResult[]
): string {
  if (matches.length < 2) {
    logger.error("matchmakerMatched: expected at least 2 entries");
    return "";
  }
  const modeRaw = matches[0].properties["game_mode"];
  const mode = modeRaw === "timed" ? "timed" : "classic";
  return nk.matchCreate(MATCH_MODULE_NAME, {
    rated: true,
    source: "matchmaker",
    mode,
    moveTimeLimitSec: 30,
  });
}
