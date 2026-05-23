import type { BestBetType } from "@/lib/best-bets";

export type PickResult = "win" | "loss";

export type RecordTotals = {
  wins: number;
  losses: number;
};

export type RecordKind = "ai" | "bestbet";

export type PendingPick = {
  gamePk: number;
  date: string;
  away: string;
  home: string;
  pickTeam: string;
  pickSide: "away" | "home";
  recordKind: RecordKind;
  lockedAt: string;
  /** Best-bet only */
  betType?: BestBetType;
  totalsPick?: "over" | "under" | null;
  totalPoint?: number | null;
  /** @deprecated Legacy combined entry */
  wasBestBet?: boolean;
};

export type SettledPick = {
  gamePk: number;
  date: string;
  away: string;
  home: string;
  pickTeam: string;
  pickSide: "away" | "home";
  recordKind: RecordKind;
  lockedAt: string;
  betType?: BestBetType;
  totalsPick?: "over" | "under" | null;
  totalPoint?: number | null;
  aiResult: PickResult;
  bestBetResult: PickResult | null;
  awayScore: number;
  homeScore: number;
  settledAt: string;
  /** @deprecated Legacy */
  wasBestBet?: boolean;
};

export type DayRecords = {
  pending: Record<string, PendingPick>;
  settled: Record<string, SettledPick>;
};

export type RecordsStore = {
  days: Record<string, DayRecords>;
};

/** Moneyline + O/U snapshot locked on first generation for a slate day. */
export type LockedGamePick = {
  gamePk: number;
  slateDate: string;
  lockedAt: string;
  pickTeam: string;
  pickSide: "away" | "home";
  pickOdds: number | null;
  recommendation: string;
  totalsPick: "over" | "under" | null;
  totalsRecommendation: string | null;
  totalsStatEdge: number;
  away: string;
  home: string;
};

export type LockedPicksDayStore = {
  picks: Record<string, LockedGamePick>;
};

export type SavedScore = {
  date: string;
  gamePk: number;
  awayScore: number;
  homeScore: number;
  isFinal: boolean;
};

export type ScoresStore = Record<string, SavedScore>;

/** When set, W-L sync is paused until this PT slate date (YYYY-MM-DD). */
export type AppMeta = {
  recordsPausedUntil: string;
  clearedAt: string;
};
