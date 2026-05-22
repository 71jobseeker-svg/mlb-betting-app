export type PickResult = "win" | "loss";

export type RecordTotals = {
  wins: number;
  losses: number;
};

export type PendingPick = {
  gamePk: number;
  date: string;
  away: string;
  home: string;
  pickTeam: string;
  pickSide: "away" | "home";
  wasBestBet: boolean;
};

export type SettledPick = {
  gamePk: number;
  date: string;
  away: string;
  home: string;
  pickTeam: string;
  pickSide: "away" | "home";
  wasBestBet: boolean;
  aiResult: PickResult;
  bestBetResult: PickResult | null;
  awayScore: number;
  homeScore: number;
  settledAt: string;
};

export type DayRecords = {
  pending: Record<string, PendingPick>;
  settled: Record<string, SettledPick>;
};

export type RecordsStore = {
  days: Record<string, DayRecords>;
};

export type SavedScore = {
  date: string;
  gamePk: number;
  awayScore: number;
  homeScore: number;
  isFinal: boolean;
};

export type ScoresStore = Record<string, SavedScore>;
