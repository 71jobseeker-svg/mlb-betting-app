import type { BestBetType } from "@/lib/best-bets";

export type PickResult = "win" | "loss" | "push";

export type RecordTotals = {
  wins: number;
  losses: number;
  pushes: number;
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
  moneylineStatEdge: number;
  totalsPick: "over" | "under" | null;
  totalsRecommendation: string | null;
  totalsStatEdge: number;
  runLineTeam: string;
  runLinePickSide: "away" | "home";
  runLineSpread: number;
  runLineOdds: number | null;
  runLineRecommendation: string;
  runLineStatEdge: number;
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

/**
 * After force-reset: recordsPausedUntil is today's PT slate date;
 * pauseRecordSyncBefore8am blocks W-L sync until 8:00 AM PT that day.
 */
export type AppMeta = {
  recordsPausedUntil: string;
  clearedAt: string;
  pauseRecordSyncBefore8am?: boolean;
};
