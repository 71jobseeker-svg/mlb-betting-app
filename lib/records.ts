import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";
import type { EnrichedGame } from "@/lib/games";

export type PickResult = "win" | "loss";

export type RecordTotals = {
  wins: number;
  losses: number;
};

export type BettingRecords = {
  pending: Record<
    string,
    {
      date: string;
      away: string;
      home: string;
      pickTeam: string;
      pickSide: "away" | "home";
      wasBestBet: boolean;
    }
  >;
  settled: Record<
    string,
    {
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
    }
  >;
  totals: {
    bestBets: RecordTotals;
    aiPicks: RecordTotals;
  };
};

const DATA_DIR = path.join(process.cwd(), "data");
const RECORDS_PATH = path.join(DATA_DIR, "betting-records.json");

const EMPTY_RECORDS: BettingRecords = {
  pending: {},
  settled: {},
  totals: {
    bestBets: { wins: 0, losses: 0 },
    aiPicks: { wins: 0, losses: 0 },
  },
};

export function loadRecords(): BettingRecords {
  try {
    if (!existsSync(RECORDS_PATH)) return { ...EMPTY_RECORDS };
    const raw = readFileSync(RECORDS_PATH, "utf8");
    const parsed = JSON.parse(raw) as BettingRecords;
    return {
      pending: parsed.pending ?? {},
      settled: parsed.settled ?? {},
      totals: parsed.totals ?? EMPTY_RECORDS.totals,
    };
  } catch {
    return { ...EMPTY_RECORDS };
  }
}

function saveRecords(records: BettingRecords): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(RECORDS_PATH, JSON.stringify(records, null, 2), "utf8");
}

function recalculateTotals(records: BettingRecords): void {
  const bestBets = { wins: 0, losses: 0 };
  const aiPicks = { wins: 0, losses: 0 };

  for (const entry of Object.values(records.settled)) {
    if (entry.aiResult === "win") aiPicks.wins++;
    else aiPicks.losses++;

    if (entry.wasBestBet && entry.bestBetResult) {
      if (entry.bestBetResult === "win") bestBets.wins++;
      else bestBets.losses++;
    }
  }

  records.totals = { bestBets, aiPicks };
}

function settlePick(
  pickSide: "away" | "home",
  awayWon: boolean
): PickResult {
  const pickWon = pickSide === "away" ? awayWon : !awayWon;
  return pickWon ? "win" : "loss";
}

export type GameToSettle = {
  gamePk: number;
  date: string;
  away: string;
  home: string;
  awayScore: number;
  homeScore: number;
  isFinal: boolean;
  awayWon: boolean | null;
  pickTeam: string;
  pickSide: "away" | "home";
  wasBestBet: boolean;
};

export function syncRecords(
  games: EnrichedGame[],
  bestBetGamePks: Set<number>,
  date: string
): BettingRecords {
  const records = loadRecords();

  for (const game of games) {
    const key = String(game.gamePk);
    const wasBestBet = bestBetGamePks.has(game.gamePk);

    if (!game.isFinal || game.awayWon === null) {
      if (!records.settled[key]) {
        records.pending[key] = {
          date,
          away: game.away,
          home: game.home,
          pickTeam: game.pickTeam,
          pickSide: game.pickSide,
          wasBestBet,
        };
      }
      continue;
    }

    if (records.settled[key]) continue;

    const pending = records.pending[key];
    const pickSide = pending?.pickSide ?? game.pickSide;
    const pickTeam = pending?.pickTeam ?? game.pickTeam;
    const bestBetFlag = pending?.wasBestBet ?? wasBestBet;

    const aiResult = settlePick(pickSide, game.awayWon);

    records.settled[key] = {
      date: pending?.date ?? date,
      away: game.away,
      home: game.home,
      pickTeam,
      pickSide,
      wasBestBet: bestBetFlag,
      aiResult,
      bestBetResult: bestBetFlag ? aiResult : null,
      awayScore: game.awayScore ?? 0,
      homeScore: game.homeScore ?? 0,
      settledAt: new Date().toISOString(),
    };

    delete records.pending[key];
  }

  recalculateTotals(records);
  saveRecords(records);
  return records;
}

export function settleRecentFinalGames(games: GameToSettle[]): BettingRecords {
  const records = loadRecords();

  for (const game of games) {
    if (!game.isFinal || game.awayWon === null) continue;

    const key = String(game.gamePk);
    if (records.settled[key]) continue;

    const pending = records.pending[key];
    if (!pending && !game.pickTeam) continue;

    const pickSide = pending?.pickSide ?? game.pickSide;
    const pickTeam = pending?.pickTeam ?? game.pickTeam;
    const wasBestBet = pending?.wasBestBet ?? game.wasBestBet;
    const aiResult = settlePick(pickSide, game.awayWon);

    records.settled[key] = {
      date: pending?.date ?? game.date,
      away: game.away,
      home: game.home,
      pickTeam,
      pickSide,
      wasBestBet,
      aiResult,
      bestBetResult: wasBestBet ? aiResult : null,
      awayScore: game.awayScore,
      homeScore: game.homeScore,
      settledAt: new Date().toISOString(),
    };

    delete records.pending[key];
  }

  recalculateTotals(records);
  saveRecords(records);
  return records;
}

export function getResultForGame(
  records: BettingRecords,
  gamePk: number
): { aiResult: PickResult | null; bestBetResult: PickResult | null } {
  const entry = records.settled[String(gamePk)];
  if (!entry) return { aiResult: null, bestBetResult: null };
  return {
    aiResult: entry.aiResult,
    bestBetResult: entry.bestBetResult,
  };
}
