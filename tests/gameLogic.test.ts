import {
  GameState,
  Move,
  addPlayer,
  applyMove,
  checkDraw,
  checkWinner,
  createInitialState,
  validateMove,
} from "../nakama/match/gameLogic";

const uidX = "user-x";
const uidO = "user-o";

describe("addPlayer", () => {
  test("defaults first turn to first joined player", () => {
    let s = createInitialState();
    s = addPlayer(s, uidX);
    s = addPlayer(s, uidO);
    expect(s.status).toBe("playing");
    expect(s.currentTurn).toBe(uidX);
  });

  test("firstTurnSlot 1 lets second joined player move first", () => {
    let s = createInitialState();
    s = addPlayer(s, uidX);
    s = addPlayer(s, uidO, undefined, 1);
    expect(s.status).toBe("playing");
    expect(s.currentTurn).toBe(uidO);
    expect(validateMove(s, { index: 0 }, uidO)).toEqual({ ok: true });
    expect(validateMove(s, { index: 0 }, uidX)).toEqual({
      ok: false,
      reason: "out_of_turn",
    });
  });
});

describe("createInitialState", () => {
  test("returns empty board and waiting status", () => {
    const s = createInitialState();
    expect(s.board).toHaveLength(9);
    expect(s.board.every((c) => c === null)).toBe(true);
    expect(s.players).toEqual([]);
    expect(s.status).toBe("waiting");
    expect(s.currentTurn).toBe("");
    expect(s.winner).toBeNull();
    expect(s.moveCount).toBe(0);
  });
});

function playingState(): GameState {
  let s = createInitialState();
  s = addPlayer(s, uidX);
  s = addPlayer(s, uidO);
  return s;
}

describe("validateMove", () => {
  test("accepts valid move on empty cell", () => {
    const s = playingState();
    const r = validateMove(s, { index: 4 }, uidX);
    expect(r).toEqual({ ok: true });
  });

  test("rejects move on occupied cell", () => {
    let s = playingState();
    s = applyMove(s, { index: 4 }, uidX);
    const r = validateMove(s, { index: 4 }, uidO);
    expect(r).toEqual({ ok: false, reason: "occupied" });
  });

  test("rejects wrong player's turn", () => {
    const s = playingState();
    const r = validateMove(s, { index: 0 }, uidO);
    expect(r).toEqual({ ok: false, reason: "out_of_turn" });
  });

  test("rejects invalid index (negative)", () => {
    const s = playingState();
    expect(validateMove(s, { index: -1 }, uidX)).toEqual({
      ok: false,
      reason: "invalid_index",
    });
  });

  test("rejects invalid index (too large)", () => {
    const s = playingState();
    expect(validateMove(s, { index: 9 }, uidX)).toEqual({
      ok: false,
      reason: "invalid_index",
    });
  });

  test("rejects non-integer index", () => {
    const s = playingState();
    const badMove = { index: 1.5 } as Move;
    expect(validateMove(s, badMove, uidX)).toEqual({
      ok: false,
      reason: "invalid_index",
    });
  });

  test("rejects when game not playing (waiting)", () => {
    const s = createInitialState();
    const r = validateMove(s, { index: 0 }, "any");
    expect(r).toEqual({ ok: false, reason: "game_not_playing" });
  });

  test("rejects when game already finished", () => {
    let s = playingState();
    s = applyMove(s, { index: 0 }, uidX);
    s = applyMove(s, { index: 1 }, uidO);
    s = applyMove(s, { index: 3 }, uidX);
    s = applyMove(s, { index: 2 }, uidO);
    s = applyMove(s, { index: 6 }, uidX);
    expect(s.status).toBe("finished");
    const r = validateMove(s, { index: 4 }, uidO);
    expect(r).toEqual({ ok: false, reason: "game_not_playing" });
  });

  test("rejects player not in match", () => {
    const s = playingState();
    const r = validateMove(s, { index: 0 }, "stranger");
    expect(r).toEqual({ ok: false, reason: "not_in_match" });
  });

  test("idempotent: same clientMoveId after success is valid and idempotent", () => {
    let s = playingState();
    const move: Move = { index: 4, clientMoveId: 100 };
    expect(validateMove(s, move, uidX)).toEqual({ ok: true });
    s = applyMove(s, move, uidX);
    expect(validateMove(s, move, uidX)).toEqual({ ok: true, idempotent: true });
  });
});

describe("applyMove", () => {
  test("updates board, increments moveCount, switches turn", () => {
    const s0 = playingState();
    const s1 = applyMove(s0, { index: 4 }, uidX);
    expect(s1.board[4]).toBe("X");
    expect(s1.moveCount).toBe(1);
    expect(s1.currentTurn).toBe(uidO);
    expect(s1.status).toBe("playing");
  });

  test("second move applies O and returns turn to X", () => {
    let s = playingState();
    s = applyMove(s, { index: 4 }, uidX);
    s = applyMove(s, { index: 0 }, uidO);
    expect(s.board[0]).toBe("O");
    expect(s.moveCount).toBe(2);
    expect(s.currentTurn).toBe(uidX);
  });

  test("sets finished and winner on winning row", () => {
    let s = playingState();
    s = applyMove(s, { index: 0 }, uidX);
    s = applyMove(s, { index: 3 }, uidO);
    s = applyMove(s, { index: 1 }, uidX);
    s = applyMove(s, { index: 4 }, uidO);
    s = applyMove(s, { index: 2 }, uidX);
    expect(s.status).toBe("finished");
    expect(s.winner).toBe(uidX);
    expect(s.currentTurn).toBe("");
  });

  test("records clientMoveId in processedClientMoveKeys", () => {
    let s = playingState();
    s = applyMove(s, { index: 0, clientMoveId: 7 }, uidX);
    expect(s.processedClientMoveKeys).toContain(`${uidX}:7`);
  });
});

describe("checkWinner", () => {
  const empty = (): (null | "X" | "O")[] => Array.from({ length: 9 }, () => null);

  test("row wins (top, middle, bottom)", () => {
    let b = empty();
    b[0] = b[1] = b[2] = "X";
    expect(checkWinner(b)).toBe("X");
    b = empty();
    b[3] = b[4] = b[5] = "O";
    expect(checkWinner(b)).toBe("O");
    b = empty();
    b[6] = b[7] = b[8] = "X";
    expect(checkWinner(b)).toBe("X");
  });

  test("column wins (left, mid, right)", () => {
    let b = empty();
    b[0] = b[3] = b[6] = "O";
    expect(checkWinner(b)).toBe("O");
    b = empty();
    b[1] = b[4] = b[7] = "X";
    expect(checkWinner(b)).toBe("X");
    b = empty();
    b[2] = b[5] = b[8] = "O";
    expect(checkWinner(b)).toBe("O");
  });

  test("diagonal wins", () => {
    let b = empty();
    b[0] = b[4] = b[8] = "X";
    expect(checkWinner(b)).toBe("X");
    b = empty();
    b[2] = b[4] = b[6] = "O";
    expect(checkWinner(b)).toBe("O");
  });

  test("no winner on empty or partial board", () => {
    expect(checkWinner(empty())).toBeNull();
    const b = empty();
    b[0] = "X";
    b[4] = "O";
    expect(checkWinner(b)).toBeNull();
  });
});

describe("checkDraw", () => {
  const empty = (): (null | "X" | "O")[] => Array.from({ length: 9 }, () => null);

  test("full board with no winner is draw", () => {
    const b = empty();
    const seq: ("X" | "O")[] = [
      "X",
      "O",
      "X",
      "X",
      "O",
      "O",
      "O",
      "X",
      "X",
    ];
    for (let i = 0; i < 9; i++) {
      b[i] = seq[i];
    }
    expect(checkWinner(b)).toBeNull();
    expect(checkDraw(b)).toBe(true);
  });

  test("partial board is not draw", () => {
    const b = empty();
    b[0] = "X";
    expect(checkDraw(b)).toBe(false);
  });

  test("full board with winner is not draw", () => {
    const b = empty();
    b[0] = b[1] = b[2] = "X";
    b[3] = b[4] = b[5] = b[6] = b[7] = b[8] = "O";
    expect(checkWinner(b)).toBe("X");
    expect(checkDraw(b)).toBe(false);
  });
});
