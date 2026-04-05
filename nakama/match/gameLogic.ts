export type Cell = null | "X" | "O";
export type GameStatus = "waiting" | "playing" | "finished";
export type GameMode = "classic" | "timed";
export type GameEndReason = "normal" | "timeout" | "disconnect" | null;

export interface PlayerSlot {
  userId: string;
  symbol: "X" | "O";
}

export interface GameState {
  board: Cell[];
  players: PlayerSlot[];
  currentTurn: string;
  status: GameStatus;
  winner: string | null;
  moveCount: number;
  processedClientMoveKeys: string[];
  gameMode: GameMode;
  /** Ticks allowed per move when timed (0 in classic). */
  moveTimeLimitTicks: number;
  /** Absolute match tick when current player must move (timed only). */
  turnDeadlineTick: number | null;
  endReason: GameEndReason;
}

export interface Move {
  index: number;
  clientMoveId?: number;
}

export type ValidationResult =
  | { ok: true }
  | { ok: true; idempotent: true }
  | { ok: false; reason: string };

const WIN_LINES: [number, number, number][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export function createInitialState(): GameState {
  return {
    board: Array.from({ length: 9 }, () => null as Cell),
    players: [],
    currentTurn: "",
    status: "waiting",
    winner: null,
    moveCount: 0,
    processedClientMoveKeys: [],
    gameMode: "classic",
    moveTimeLimitTicks: 0,
    turnDeadlineTick: null,
    endReason: null,
  };
}

/**
 * Configure rules before players join. tickRate is match ticks per second (e.g. 5).
 */
export function configureMatchRules(
  state: GameState,
  gameMode: GameMode,
  moveTimeLimitSec: number,
  tickRate: number
): GameState {
  if (gameMode === "classic") {
    return {
      ...state,
      gameMode: "classic",
      moveTimeLimitTicks: 0,
      turnDeadlineTick: null,
    };
  }
  const sec = Math.max(5, Math.min(120, Math.floor(moveTimeLimitSec) || 30));
  const tr = tickRate > 0 ? tickRate : 5;
  const ticks = Math.max(tr, Math.floor(sec * tr));
  return {
    ...state,
    gameMode: "timed",
    moveTimeLimitTicks: ticks,
    turnDeadlineTick: null,
  };
}

function symbolForPlayer(state: GameState, playerId: string): "X" | "O" | null {
  const p = state.players.find((x) => x.userId === playerId);
  return p ? p.symbol : null;
}

function opponentUserId(state: GameState, playerId: string): string | null {
  const other = state.players.find((x) => x.userId !== playerId);
  return other ? other.userId : null;
}

function clientMoveKey(playerId: string, clientMoveId: number): string {
  return `${playerId}:${clientMoveId}`;
}

/**
 * If the current player exceeded the turn deadline, they forfeit to the opponent.
 */
export function maybeApplyTurnTimeout(
  state: GameState,
  matchTick: number
): GameState {
  if (state.status !== "playing" || state.gameMode !== "timed") {
    return state;
  }
  if (
    state.turnDeadlineTick === null ||
    state.turnDeadlineTick === undefined
  ) {
    return state;
  }
  if (matchTick < state.turnDeadlineTick) {
    return state;
  }
  const loser = state.currentTurn;
  if (!loser) {
    return state;
  }
  const opponent = opponentUserId(state, loser);
  if (!opponent) {
    return {
      ...state,
      status: "finished",
      winner: null,
      currentTurn: "",
      endReason: "timeout",
      turnDeadlineTick: null,
    };
  }
  return {
    ...state,
    status: "finished",
    winner: opponent,
    currentTurn: "",
    endReason: "timeout",
    turnDeadlineTick: null,
  };
}

export function validateMove(
  state: GameState,
  move: Move,
  playerId: string
): ValidationResult {
  if (move.clientMoveId !== undefined) {
    const key = clientMoveKey(playerId, move.clientMoveId);
    if (state.processedClientMoveKeys.indexOf(key) !== -1) {
      return { ok: true, idempotent: true };
    }
  }

  if (state.status !== "playing") {
    return { ok: false, reason: "game_not_playing" };
  }

  if (!symbolForPlayer(state, playerId)) {
    return { ok: false, reason: "not_in_match" };
  }

  if (state.currentTurn !== playerId) {
    return { ok: false, reason: "out_of_turn" };
  }

  const idx = move.index;
  if (typeof idx !== "number" || !Number.isInteger(idx) || idx < 0 || idx > 8) {
    return { ok: false, reason: "invalid_index" };
  }

  if (state.board[idx] !== null) {
    return { ok: false, reason: "occupied" };
  }

  return { ok: true };
}

export function applyMove(
  state: GameState,
  move: Move,
  playerId: string,
  matchTick?: number
): GameState {
  const symbol = symbolForPlayer(state, playerId);
  if (!symbol || state.status !== "playing" || state.currentTurn !== playerId) {
    return state;
  }
  const idx = move.index;
  if (typeof idx !== "number" || !Number.isInteger(idx) || idx < 0 || idx > 8) {
    return state;
  }
  if (state.board[idx] !== null) {
    return state;
  }

  const board = state.board.slice() as Cell[];
  board[idx] = symbol;
  let moveCount = state.moveCount + 1;
  let currentTurn = opponentUserId(state, playerId) || state.currentTurn;
  let status: GameStatus = state.status;
  let winner: string | null = state.winner;
  let endReason: GameEndReason = state.endReason;
  const processedClientMoveKeys =
    move.clientMoveId !== undefined
      ? state.processedClientMoveKeys.concat(
          clientMoveKey(playerId, move.clientMoveId)
        )
      : state.processedClientMoveKeys.slice();

  const winSymbol = checkWinner(board);
  if (winSymbol) {
    status = "finished";
    const w = state.players.find((p) => p.symbol === winSymbol);
    winner = w ? w.userId : null;
    currentTurn = "";
    endReason = "normal";
  } else if (checkDraw(board)) {
    status = "finished";
    winner = null;
    currentTurn = "";
    endReason = "normal";
  }

  let next: GameState = {
    ...state,
    board,
    moveCount,
    currentTurn,
    status,
    winner,
    processedClientMoveKeys,
    endReason,
  };

  if (status === "playing" && next.gameMode === "timed" && matchTick !== undefined) {
    next = {
      ...next,
      turnDeadlineTick: matchTick + next.moveTimeLimitTicks,
    };
  }
  if (status === "finished") {
    next = { ...next, turnDeadlineTick: null };
  }

  return next;
}

export function checkWinner(board: Cell[]): "X" | "O" | null {
  for (const [a, b, c] of WIN_LINES) {
    const x = board[a];
    if (x !== null && x === board[b] && x === board[c]) {
      return x;
    }
  }
  return null;
}

export function checkDraw(board: Cell[]): boolean {
  if (checkWinner(board) !== null) {
    return false;
  }
  for (let i = 0; i < 9; i++) {
    if (board[i] === null) {
      return false;
    }
  }
  return true;
}

/**
 * @param firstTurnSlot When the second player is added, `0` = first joined moves first,
 *   `1` = second joined moves first. Omitted defaults to `0` (deterministic for tests).
 */
export function addPlayer(
  state: GameState,
  userId: string,
  matchTick?: number,
  firstTurnSlot?: 0 | 1
): GameState {
  if (state.players.some((p) => p.userId === userId)) {
    return state;
  }
  if (state.players.length >= 2) {
    return state;
  }
  const symbol: "X" | "O" = state.players.length === 0 ? "X" : "O";
  const players = state.players.concat([{ userId, symbol }]);
  let next: GameState = {
    ...state,
    players,
    board: state.board.slice() as Cell[],
    processedClientMoveKeys: state.processedClientMoveKeys.slice(),
  };
  if (players.length === 2) {
    const slot: 0 | 1 = firstTurnSlot === 1 ? 1 : 0;
    next = {
      ...next,
      status: "playing",
      currentTurn: players[slot].userId,
    };
    if (
      next.gameMode === "timed" &&
      matchTick !== undefined &&
      next.moveTimeLimitTicks > 0
    ) {
      next = {
        ...next,
        turnDeadlineTick: matchTick + next.moveTimeLimitTicks,
      };
    }
  }
  return next;
}

export function applyDisconnect(
  state: GameState,
  disconnectedUserId: string
): GameState {
  if (state.status !== "playing") {
    return state;
  }
  if (!state.players.some((p) => p.userId === disconnectedUserId)) {
    return state;
  }
  const opponent = state.players.find((p) => p.userId !== disconnectedUserId);
  if (!opponent) {
    return {
      ...state,
      status: "finished",
      winner: null,
      currentTurn: "",
      endReason: "disconnect",
      turnDeadlineTick: null,
    };
  }
  return {
    ...state,
    status: "finished",
    winner: opponent.userId,
    currentTurn: "",
    endReason: "disconnect",
    turnDeadlineTick: null,
  };
}
