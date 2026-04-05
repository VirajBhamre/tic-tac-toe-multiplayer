import {
  DEFAULT_RATING,
  computeEloUpdate,
  expectedScore,
  kFactor,
} from "../nakama/match/ratingLogic";

describe("expectedScore", () => {
  test("equal ratings yield 0.5", () => {
    expect(expectedScore(1200, 1200)).toBeCloseTo(0.5, 5);
  });

  test("higher rated player has higher expected score", () => {
    expect(expectedScore(1400, 1200)).toBeGreaterThan(0.5);
    expect(expectedScore(1200, 1400)).toBeLessThan(0.5);
  });
});

describe("kFactor", () => {
  test("provisional period uses 40", () => {
    expect(kFactor(1200, 0)).toBe(40);
    expect(kFactor(1200, 29)).toBe(40);
  });

  test("established under 2400 uses 20", () => {
    expect(kFactor(1200, 30)).toBe(20);
    expect(kFactor(2399, 100)).toBe(20);
  });

  test("very high rating uses 10", () => {
    expect(kFactor(2400, 30)).toBe(10);
  });
});

describe("computeEloUpdate", () => {
  test("draw between equal ratings does not change ratings", () => {
    const a = { rating: 1200, gamesPlayed: 10 };
    const b = { rating: 1200, gamesPlayed: 10 };
    const out = computeEloUpdate(a, b, 0.5);
    expect(out.newRatingA).toBe(1200);
    expect(out.newRatingB).toBe(1200);
    expect(out.newGamesPlayedA).toBe(11);
    expect(out.newGamesPlayedB).toBe(11);
  });

  test("winner gains and loser loses with equal ratings", () => {
    const a = { rating: 1200, gamesPlayed: 30 };
    const b = { rating: 1200, gamesPlayed: 30 };
    const out = computeEloUpdate(a, b, 1);
    expect(out.newRatingA).toBeGreaterThan(1200);
    expect(out.newRatingB).toBeLessThan(1200);
    expect(out.newRatingA + out.newRatingB).toBe(2400);
  });

  test("upset win moves ratings strongly", () => {
    const weak = { rating: 1000, gamesPlayed: 30 };
    const strong = { rating: 1600, gamesPlayed: 30 };
    const out = computeEloUpdate(weak, strong, 1);
    expect(out.newRatingA).toBeGreaterThan(weak.rating);
    expect(out.newRatingB).toBeLessThan(strong.rating);
  });

  test("uses DEFAULT_RATING concept via typical starting values", () => {
    expect(DEFAULT_RATING).toBe(1200);
  });
});
