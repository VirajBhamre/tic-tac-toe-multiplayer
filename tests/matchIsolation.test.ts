import { createInitialState } from "../nakama/match/gameLogic";

/**
 * Each authoritative Nakama match holds its own handler state; game boards
 * are never shared between matches. This test locks in that our state factory
 * produces independent objects (no accidental shared board reference).
 */
describe("match isolation (concurrent sessions)", () => {
  test("createInitialState returns independent boards", () => {
    const a = createInitialState();
    const b = createInitialState();
    expect(a.board).not.toBe(b.board);
    a.board[0] = "X";
    expect(b.board[0]).toBeNull();
  });
});
