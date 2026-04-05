/**
 * Shapes returned by the authoritative Nakama match handler (OP_STATE broadcasts).
 * The UI must only reflect these fields — no local game rules.
 */
export type ServerCell = null | "X" | "O";

export type ServerGameStatus = "waiting" | "playing" | "finished";

export type ServerGameMode = "classic" | "timed";

export type ServerEndReason = "normal" | "timeout" | "disconnect" | null;

export interface ServerPlayer {
  userId: string;
  symbol: "X" | "O";
}

export interface EloSummaryEntry {
  before: number;
  after: number;
}

export interface ServerGameSnapshot {
  board: ServerCell[];
  players: ServerPlayer[];
  currentTurn: string;
  status: ServerGameStatus;
  winner: string | null;
  moveCount: number;
  /** Present after a rated game ends and Elo is committed. */
  eloSummary?: Record<string, EloSummaryEntry>;
  gameMode: ServerGameMode;
  moveTimeLimitTicks: number;
  turnDeadlineTick: number | null;
  endReason: ServerEndReason;
  matchTick: number;
  tickRate: number;
}

function parseEndReason(v: unknown): ServerEndReason {
  if (v === "normal" || v === "timeout" || v === "disconnect") {
    return v;
  }
  return null;
}

export function parseServerSnapshot(raw: unknown): ServerGameSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.board) || o.board.length !== 9) return null;
  if (!Array.isArray(o.players)) return null;
  if (typeof o.currentTurn !== "string") return null;
  if (o.status !== "waiting" && o.status !== "playing" && o.status !== "finished") {
    return null;
  }
  if ("winner" in o && o.winner !== null && typeof o.winner !== "string") {
    return null;
  }
  let eloSummary: Record<string, EloSummaryEntry> | undefined;
  if (o.eloSummary !== undefined && o.eloSummary !== null) {
    if (typeof o.eloSummary === "object" && !Array.isArray(o.eloSummary)) {
      const rawElo = o.eloSummary as Record<string, unknown>;
      const built: Record<string, EloSummaryEntry> = {};
      for (const k of Object.keys(rawElo)) {
        const e = rawElo[k];
        if (
          e &&
          typeof e === "object" &&
          typeof (e as { before?: unknown }).before === "number" &&
          typeof (e as { after?: unknown }).after === "number"
        ) {
          built[k] = {
            before: (e as { before: number }).before,
            after: (e as { after: number }).after,
          };
        }
      }
      if (Object.keys(built).length > 0) {
        eloSummary = built;
      }
    }
  }

  const gameMode: ServerGameMode =
    o.gameMode === "timed" ? "timed" : "classic";
  const moveTimeLimitTicks =
    typeof o.moveTimeLimitTicks === "number" ? o.moveTimeLimitTicks : 0;
  const turnDeadlineTick =
    typeof o.turnDeadlineTick === "number" ? o.turnDeadlineTick : null;
  const matchTick = typeof o.matchTick === "number" ? o.matchTick : 0;
  const tickRate = typeof o.tickRate === "number" ? o.tickRate : 5;

  return {
    board: o.board as ServerCell[],
    players: o.players as ServerPlayer[],
    currentTurn: o.currentTurn,
    status: o.status,
    winner: (o.winner as string | null) ?? null,
    moveCount: typeof o.moveCount === "number" ? o.moveCount : 0,
    eloSummary,
    gameMode,
    moveTimeLimitTicks,
    turnDeadlineTick,
    endReason: parseEndReason(o.endReason),
    matchTick,
    tickRate,
  };
}
