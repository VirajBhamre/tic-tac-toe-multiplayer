/// <reference types="nakama-runtime" />

import { readPlayerStats, writePlayerStats } from "../lib/statsStorage";
import { readRatingRecord, writeRatingRecord } from "../lib/ratingStorage";
import { LEADERBOARD_WINS_ID } from "./constants";
import type { TicMatchState } from "./matchTypes";
import { computeEloUpdate } from "./ratingLogic";
import {
  mergeResultIntoStats,
  outcomesForFinishedGame,
} from "./statsLogic";

function accountUsername(nk: nkruntime.Nakama, userId: string): string {
  try {
    const acc = nk.accountGetId(userId);
    return acc.user.username || "";
  } catch {
    return "";
  }
}

export function tryCommitPostGame(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  state: TicMatchState
): boolean {
  if (state.postGameCommitted) {
    return false;
  }
  const g = state.game;
  if (g.status !== "finished" || g.players.length !== 2) {
    return false;
  }
  const a = g.players[0].userId;
  const b = g.players[1].userId;

  if (state.rated) {
    let scoreA: number;
    if (g.winner === null) {
      scoreA = 0.5;
    } else if (g.winner === a) {
      scoreA = 1;
    } else {
      scoreA = 0;
    }
    const recA = readRatingRecord(nk, a);
    const recB = readRatingRecord(nk, b);
    const upd = computeEloUpdate(recA, recB, scoreA);
    writeRatingRecord(nk, a, {
      rating: upd.newRatingA,
      gamesPlayed: upd.newGamesPlayedA,
    });
    writeRatingRecord(nk, b, {
      rating: upd.newRatingB,
      gamesPlayed: upd.newGamesPlayedB,
    });
    state.eloSummary = {
      [a]: { before: recA.rating, after: upd.newRatingA },
      [b]: { before: recB.rating, after: upd.newRatingB },
    };
  } else {
    state.eloSummary = null;
  }

  const { a: oa, b: ob } = outcomesForFinishedGame(a, b, g.winner);
  const statsA = mergeResultIntoStats(readPlayerStats(nk, a), oa);
  const statsB = mergeResultIntoStats(readPlayerStats(nk, b), ob);
  writePlayerStats(nk, a, statsA);
  writePlayerStats(nk, b, statsB);

  if (state.rated) {
    const userA = accountUsername(nk, a);
    const userB = accountUsername(nk, b);
    try {
      nk.leaderboardRecordWrite(
        LEADERBOARD_WINS_ID,
        a,
        userA,
        statsA.wins,
        statsA.winStreak,
        { losses: statsA.losses, draws: statsA.draws },
        "set" as nkruntime.OverrideOperator
      );
    } catch (e) {
      logger.error("leaderboard write failed (player a): %s", String(e));
    }
    try {
      nk.leaderboardRecordWrite(
        LEADERBOARD_WINS_ID,
        b,
        userB,
        statsB.wins,
        statsB.winStreak,
        { losses: statsB.losses, draws: statsB.draws },
        "set" as nkruntime.OverrideOperator
      );
    } catch (e) {
      logger.error("leaderboard write failed (player b): %s", String(e));
    }
  }

  state.postGameCommitted = true;
  return true;
}
