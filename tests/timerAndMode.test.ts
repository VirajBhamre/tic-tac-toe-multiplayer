import {
  addPlayer,
  applyMove,
  configureMatchRules,
  createInitialState,
  maybeApplyTurnTimeout,
} from "../nakama/match/gameLogic";

const uidX = "user-x";
const uidO = "user-o";

describe("configureMatchRules", () => {
  test("classic clears timer fields", () => {
    let s = createInitialState();
    s = configureMatchRules(s, "timed", 30, 5);
    expect(s.gameMode).toBe("timed");
    expect(s.moveTimeLimitTicks).toBe(150);
    s = configureMatchRules(s, "classic", 30, 5);
    expect(s.gameMode).toBe("classic");
    expect(s.moveTimeLimitTicks).toBe(0);
    expect(s.turnDeadlineTick).toBeNull();
  });

  test("timed clamps seconds and respects tick rate", () => {
    const s = configureMatchRules(createInitialState(), "timed", 1, 5);
    expect(s.moveTimeLimitTicks).toBe(25);
    const s2 = configureMatchRules(createInitialState(), "timed", 999, 5);
    expect(s2.moveTimeLimitTicks).toBe(600);
  });
});

describe("maybeApplyTurnTimeout", () => {
  function timedPlayingAt(
    tick: number,
    deadline: number
  ): ReturnType<typeof createInitialState> {
    let s = createInitialState();
    s = configureMatchRules(s, "timed", 30, 5);
    s = addPlayer(s, uidX, tick);
    s = addPlayer(s, uidO, tick);
    expect(s.status).toBe("playing");
    s = { ...s, turnDeadlineTick: deadline };
    return s;
  }

  test("no-op before deadline", () => {
    const s = timedPlayingAt(0, 100);
    const next = maybeApplyTurnTimeout(s, 50);
    expect(next).toBe(s);
  });

  test("forfeits at deadline to opponent", () => {
    const s = timedPlayingAt(0, 100);
    expect(s.currentTurn).toBe(uidX);
    const next = maybeApplyTurnTimeout(s, 100);
    expect(next.status).toBe("finished");
    expect(next.winner).toBe(uidO);
    expect(next.endReason).toBe("timeout");
    expect(next.turnDeadlineTick).toBeNull();
  });

  test("classic mode never times out", () => {
    let s = createInitialState();
    s = addPlayer(s, uidX);
    s = addPlayer(s, uidO);
    s = { ...s, turnDeadlineTick: 10, gameMode: "classic" as const };
    expect(maybeApplyTurnTimeout(s, 999)).toBe(s);
  });
});

describe("applyMove refreshes deadline in timed mode", () => {
  test("after move, new deadline is set from match tick", () => {
    let s = createInitialState();
    s = configureMatchRules(s, "timed", 6, 5);
    s = addPlayer(s, uidX, 0);
    s = addPlayer(s, uidO, 0);
    expect(s.turnDeadlineTick).toBe(30);
    s = applyMove(s, { index: 4 }, uidX, 5);
    expect(s.status).toBe("playing");
    expect(s.currentTurn).toBe(uidO);
    expect(s.moveTimeLimitTicks).toBe(30);
    expect(s.turnDeadlineTick).toBe(5 + 30);
  });
});
