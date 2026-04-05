/// <reference types="nakama-runtime" />

import type { GameState } from "./gameLogic";

export type EloSummary = {
  [userId: string]: { before: number; after: number };
};

export type TicMatchState = {
  labelOpen: number;
  presences: { [userId: string]: nkruntime.Presence | null };
  joinsInProgress: number;
  game: GameState;
  rated: boolean;
  postGameCommitted: boolean;
  eloSummary: EloSummary | null;
};
