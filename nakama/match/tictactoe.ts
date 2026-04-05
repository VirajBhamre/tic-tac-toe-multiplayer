/// <reference types="nakama-runtime" />

import { readUsernameOnboarded } from "../lib/profileFlags";
import { MATCH_TICK_RATE, MATCH_MODULE_NAME } from "./constants";
import {
  Move,
  addPlayer,
  applyDisconnect,
  applyMove,
  configureMatchRules,
  createInitialState,
  maybeApplyTurnTimeout,
  validateMove,
} from "./gameLogic";
import type { TicMatchState } from "./matchTypes";
import { tryCommitPostGame } from "./postGameCommit";

export {
  LEADERBOARD_WINS_ID,
  MATCH_MODULE_NAME,
  MATCH_TICK_RATE,
} from "./constants";
export type { EloSummary, TicMatchState } from "./matchTypes";

const OP_STATE = 1;
const OP_MOVE = 2;
const OP_REJECT = 3;

function connectedCount(state: TicMatchState): number {
  let n = 0;
  for (const uid of Object.keys(state.presences)) {
    if (state.presences[uid] !== null) {
      n++;
    }
  }
  return n;
}

function parseRatedFromParams(params: { [key: string]: any }): boolean {
  const r = params["rated"];
  if (r === false || r === "false" || r === 0 || r === "0") {
    return false;
  }
  return true;
}

function parseGameMode(params: { [key: string]: any }): "classic" | "timed" {
  const m = params["mode"];
  if (m === "timed" || m === true || m === "true" || m === 1) {
    return "timed";
  }
  return "classic";
}

function parseMoveTimeLimitSec(params: { [key: string]: any }): number {
  const raw = params["moveTimeLimitSec"];
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === "string") {
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n)) return n;
  }
  return 30;
}

function publicGamePayload(state: TicMatchState, matchTick: number): string {
  const game = state.game;
  const payload: Record<string, unknown> = {
    board: game.board,
    players: game.players,
    currentTurn: game.currentTurn,
    status: game.status,
    winner: game.winner,
    moveCount: game.moveCount,
    gameMode: game.gameMode,
    moveTimeLimitTicks: game.moveTimeLimitTicks,
    turnDeadlineTick: game.turnDeadlineTick,
    endReason: game.endReason,
    matchTick,
    tickRate: MATCH_TICK_RATE,
  };
  if (state.eloSummary) {
    payload.eloSummary = state.eloSummary;
  }
  return JSON.stringify(payload);
}

function randomFirstTurnSlot(nk: nkruntime.Nakama): 0 | 1 {
  const buf = nk.secureRandomBytes(1);
  const u = new Uint8Array(buf);
  return (u[0] & 1) as 0 | 1;
}

export function matchInit(
  _ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  params: { [key: string]: any }
): { state: TicMatchState; tickRate: number; label: string } {
  const mode = parseGameMode(params);
  const moveSec = parseMoveTimeLimitSec(params);
  let game = createInitialState();
  game = configureMatchRules(game, mode, moveSec, MATCH_TICK_RATE);
  const state: TicMatchState = {
    labelOpen: 1,
    presences: {},
    joinsInProgress: 0,
    game,
    rated: parseRatedFromParams(params),
    postGameCommitted: false,
    eloSummary: null,
  };
  return {
    state,
    tickRate: MATCH_TICK_RATE,
    label: JSON.stringify({
      open: 1,
      name: MATCH_MODULE_NAME,
      mode: game.gameMode,
    }),
  };
}

export function matchJoinAttempt(
  _ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  _dispatcher: nkruntime.MatchDispatcher,
  _tick: number,
  state: TicMatchState,
  presence: nkruntime.Presence,
  _metadata: { [key: string]: any }
) {
  if (!readUsernameOnboarded(nk, presence.userId)) {
    return {
      state,
      accept: false,
      rejectMessage: "username_onboarding_required",
    };
  }
  const existing = state.presences[presence.userId];
  if (existing !== undefined && existing !== null) {
    return {
      state,
      accept: false,
      rejectMessage: "already_joined",
    };
  }
  if (existing === null) {
    state.joinsInProgress++;
    return { state, accept: true };
  }
  if (connectedCount(state) + state.joinsInProgress >= 2) {
    return {
      state,
      accept: false,
      rejectMessage: "match_full",
    };
  }
  state.joinsInProgress++;
  return { state, accept: true };
}

export function matchJoin(
  _ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: TicMatchState,
  presences: nkruntime.Presence[]
) {
  for (const p of presences) {
    state.presences[p.userId] = p;
    state.joinsInProgress = Math.max(0, state.joinsInProgress - 1);
    const completesPair =
      state.game.players.length === 1 &&
      !state.game.players.some((pl) => pl.userId === p.userId);
    const firstSlot = completesPair ? randomFirstTurnSlot(nk) : undefined;
    state.game = addPlayer(state.game, p.userId, tick, firstSlot);
  }
  if (connectedCount(state) >= 2 && state.labelOpen !== 0) {
    state.labelOpen = 0;
    dispatcher.matchLabelUpdate(
      JSON.stringify({
        open: 0,
        name: MATCH_MODULE_NAME,
        mode: state.game.gameMode,
      })
    );
  }
  dispatcher.broadcastMessage(
    OP_STATE,
    publicGamePayload(state, tick),
    null,
    null,
    true
  );
  return { state };
}

export function matchLeave(
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: TicMatchState,
  presences: nkruntime.Presence[]
) {
  for (const p of presences) {
    state.presences[p.userId] = null;
    state.game = applyDisconnect(state.game, p.userId);
  }
  tryCommitPostGame(nk, logger, state);
  dispatcher.broadcastMessage(
    OP_STATE,
    publicGamePayload(state, tick),
    null,
    null,
    true
  );
  return { state };
}

export function matchLoop(
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: TicMatchState,
  messages: nkruntime.MatchMessage[]
) {
  for (const message of messages) {
    if (message.opCode !== OP_MOVE) {
      continue;
    }
    let move: Move;
    try {
      move = JSON.parse(nk.binaryToString(message.data)) as Move;
    } catch {
      dispatcher.broadcastMessage(
        OP_REJECT,
        JSON.stringify({ reason: "bad_payload" }),
        [message.sender],
        null,
        true
      );
      continue;
    }
    const playerId = message.sender.userId;
    const v = validateMove(state.game, move, playerId);
    if (!v.ok) {
      dispatcher.broadcastMessage(
        OP_REJECT,
        JSON.stringify({ reason: v.reason }),
        [message.sender],
        null,
        true
      );
      continue;
    }
    if ("idempotent" in v && v.idempotent) {
      dispatcher.broadcastMessage(
        OP_STATE,
        publicGamePayload(state, tick),
        null,
        null,
        true
      );
      continue;
    }
    state.game = applyMove(state.game, move, playerId, tick);
    tryCommitPostGame(nk, logger, state);
    dispatcher.broadcastMessage(
      OP_STATE,
      publicGamePayload(state, tick),
      null,
      null,
      true
    );
  }

  const afterTimeout = maybeApplyTurnTimeout(state.game, tick);
  if (afterTimeout !== state.game) {
    state.game = afterTimeout;
    tryCommitPostGame(nk, logger, state);
    dispatcher.broadcastMessage(
      OP_STATE,
      publicGamePayload(state, tick),
      null,
      null,
      true
    );
  }

  return { state };
}

export function matchTerminate(
  _ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  _dispatcher: nkruntime.MatchDispatcher,
  _tick: number,
  state: TicMatchState,
  _graceSeconds: number
) {
  return { state };
}

export function matchSignal(
  _ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  _dispatcher: nkruntime.MatchDispatcher,
  _tick: number,
  state: TicMatchState,
  _data: string
) {
  return { state };
}
