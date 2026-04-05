import {
  defaultPlayerStats,
  mergeResultIntoStats,
  normalizePlayerStats,
  outcomesForFinishedGame,
} from "../nakama/match/statsLogic";

describe("defaultPlayerStats", () => {
  test("returns zeros", () => {
    expect(defaultPlayerStats()).toEqual({
      wins: 0,
      losses: 0,
      draws: 0,
      winStreak: 0,
    });
  });
});

describe("normalizePlayerStats", () => {
  test("coerces invalid values", () => {
    expect(normalizePlayerStats({})).toEqual(defaultPlayerStats());
    expect(
      normalizePlayerStats({
        wins: 3.7,
        losses: -1,
        draws: "x" as unknown as number,
        winStreak: NaN,
      })
    ).toEqual({ wins: 3, losses: 0, draws: 0, winStreak: 0 });
  });
});

describe("mergeResultIntoStats", () => {
  const base = defaultPlayerStats();

  test("win increments wins and streak", () => {
    const s = mergeResultIntoStats(base, "win");
    expect(s).toEqual({ wins: 1, losses: 0, draws: 0, winStreak: 1 });
    const s2 = mergeResultIntoStats(s, "win");
    expect(s2.winStreak).toBe(2);
  });

  test("loss increments losses and resets streak", () => {
    const hot = mergeResultIntoStats(mergeResultIntoStats(base, "win"), "win");
    const s = mergeResultIntoStats(hot, "loss");
    expect(s).toEqual({ wins: 2, losses: 1, draws: 0, winStreak: 0 });
  });

  test("draw increments draws and resets streak", () => {
    const hot = mergeResultIntoStats(base, "win");
    const s = mergeResultIntoStats(hot, "draw");
    expect(s).toEqual({ wins: 1, losses: 0, draws: 1, winStreak: 0 });
  });
});

describe("outcomesForFinishedGame", () => {
  const a = "pa";
  const b = "pb";

  test("draw", () => {
    expect(outcomesForFinishedGame(a, b, null)).toEqual({
      a: "draw",
      b: "draw",
    });
  });

  test("A wins", () => {
    expect(outcomesForFinishedGame(a, b, a)).toEqual({
      a: "win",
      b: "loss",
    });
  });

  test("B wins", () => {
    expect(outcomesForFinishedGame(a, b, b)).toEqual({
      a: "loss",
      b: "win",
    });
  });

  test("unknown winner treated as draw", () => {
    expect(outcomesForFinishedGame(a, b, "other")).toEqual({
      a: "draw",
      b: "draw",
    });
  });
});
