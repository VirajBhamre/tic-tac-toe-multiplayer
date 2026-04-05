/// <reference types="nakama-runtime" />

import { LEADERBOARD_WINS_ID, MATCH_MODULE_NAME } from "../match/constants";
import {
  TicMatchState,
  matchInit,
  matchJoin,
  matchJoinAttempt,
  matchLeave,
  matchLoop,
  matchSignal,
  matchTerminate,
} from "../match/tictactoe";
import { installHostingKeepalive } from "./keepalive";
import { matchmakerMatched } from "./matchmakerMatched";
import {
  changePassword,
  checkUsernameAvailable,
  createMatch,
  getLeaderboard,
  getMyStats,
  getProfileStatus,
  getRating,
  joinMatch,
  listOpenMatches,
  ping,
  setUsernameAndOnboard,
  signInWithIdentifier,
} from "./rpc";

function InitModule(
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  initializer: nkruntime.Initializer
) {
  try {
    nk.leaderboardCreate(
      LEADERBOARD_WINS_ID,
      true,
      "descending" as nkruntime.SortOrder,
      "set" as nkruntime.Operator,
      null,
      { title: "Tic-Tac-Toe wins" },
      true
    );
  } catch (e) {
    logger.error("leaderboard create failed (global wins LB): %s", String(e));
  }

  initializer.registerRpc("createMatch", createMatch);
  initializer.registerRpc("creatematch", createMatch);
  initializer.registerRpc("joinMatch", joinMatch);
  initializer.registerRpc("joinmatch", joinMatch);
  initializer.registerRpc("getRating", getRating);
  initializer.registerRpc("getrating", getRating);
  initializer.registerRpc("listOpenMatches", listOpenMatches);
  initializer.registerRpc("listopenmatches", listOpenMatches);
  initializer.registerRpc("getLeaderboard", getLeaderboard);
  initializer.registerRpc("getleaderboard", getLeaderboard);
  initializer.registerRpc("getMyStats", getMyStats);
  initializer.registerRpc("getmystats", getMyStats);
  initializer.registerRpc("signInWithIdentifier", signInWithIdentifier);
  initializer.registerRpc("signinwithidentifier", signInWithIdentifier);
  initializer.registerRpc("getProfileStatus", getProfileStatus);
  initializer.registerRpc("getprofilestatus", getProfileStatus);
  initializer.registerRpc("checkUsernameAvailable", checkUsernameAvailable);
  initializer.registerRpc("checkusernameavailable", checkUsernameAvailable);
  initializer.registerRpc("setUsernameAndOnboard", setUsernameAndOnboard);
  initializer.registerRpc("setusernameandonboard", setUsernameAndOnboard);
  initializer.registerRpc("changePassword", changePassword);
  initializer.registerRpc("changepassword", changePassword);
  initializer.registerRpc("ping", ping);
  installHostingKeepalive(logger, nk, _ctx.env);
  initializer.registerMatchmakerMatched(matchmakerMatched);
  initializer.registerMatch<TicMatchState>(MATCH_MODULE_NAME, {
    matchInit,
    matchJoinAttempt,
    matchJoin,
    matchLeave,
    matchLoop,
    matchTerminate,
    matchSignal,
  });
  logger.info("tic_tac_toe backend loaded");
}

(globalThis as unknown as { InitModule: typeof InitModule }).InitModule = InitModule;
