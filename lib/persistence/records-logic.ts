import type {
  DayRecords,
  PickResult,
  RecordTotals,
  RecordsStore,
  ScoresStore,
} from "@/lib/persistence/types";
import { recordKey, scoreKey } from "@/lib/persistence/keys";

export function emptyRecordsStore(): RecordsStore {
  return { days: {} };
}

function emptyDay(): DayRecords {
  return { pending: {}, settled: {} };
}

function getDay(store: RecordsStore, date: string): DayRecords {
  if (!store.days[date]) store.days[date] = emptyDay();
  return store.days[date];
}

function settlePick(pickSide: "away" | "home", awayWon: boolean): PickResult {
  return pickSide === "away" ? (awayWon ? "win" : "loss") : awayWon ? "loss" : "win";
}

export function computeHistoricalTotals(store: RecordsStore): {
  bestBets: RecordTotals;
  aiPicks: RecordTotals;
} {
  const bestBets = { wins: 0, losses: 0 };
  const aiPicks = { wins: 0, losses: 0 };

  for (const day of Object.values(store.days)) {
    for (const entry of Object.values(day.settled)) {
      if (entry.aiResult === "win") aiPicks.wins++;
      else aiPicks.losses++;

      if (entry.wasBestBet && entry.bestBetResult) {
        if (entry.bestBetResult === "win") bestBets.wins++;
        else bestBets.losses++;
      }
    }
  }

  return { bestBets, aiPicks };
}

type GameForRecords = {
  gamePk: number;
  away: string;
  home: string;
  pickTeam: string;
  pickSide: "away" | "home";
  isFinal: boolean;
  awayWon: boolean | null;
  awayScore: number | null;
  homeScore: number | null;
};

export function syncDayRecords(
  store: RecordsStore,
  slateDate: string,
  games: GameForRecords[],
  bestBetGamePks: Set<number>
): RecordsStore {
  const day = getDay(store, slateDate);

  for (const game of games) {
    const key = recordKey(game.gamePk);
    const wasBestBet = bestBetGamePks.has(game.gamePk);

    if (!game.isFinal || game.awayWon === null) {
      if (!day.settled[key]) {
        day.pending[key] = {
          gamePk: game.gamePk,
          date: slateDate,
          away: game.away,
          home: game.home,
          pickTeam: game.pickTeam,
          pickSide: game.pickSide,
          wasBestBet,
        };
      }
      continue;
    }

    if (day.settled[key]) continue;

    const pending = day.pending[key];
    const pickSide = pending?.pickSide ?? game.pickSide;
    const pickTeam = pending?.pickTeam ?? game.pickTeam;
    const bestBetFlag = pending?.wasBestBet ?? wasBestBet;
    const aiResult = settlePick(pickSide, game.awayWon);

    day.settled[key] = {
      gamePk: game.gamePk,
      date: pending?.date ?? slateDate,
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

    delete day.pending[key];
  }

  return store;
}

/** Settle pending picks from earlier days when we have saved final scores. */
export function settlePendingFromScores(
  store: RecordsStore,
  scores: ScoresStore
): RecordsStore {
  for (const [date, day] of Object.entries(store.days)) {
    for (const [key, pending] of Object.entries(day.pending)) {
      const sk = scoreKey(date, pending.gamePk);
      const saved = scores[sk];
      if (!saved?.isFinal) continue;

      const awayWon = saved.awayScore > saved.homeScore;
      const aiResult = settlePick(pending.pickSide, awayWon);

      day.settled[key] = {
        gamePk: pending.gamePk,
        date: pending.date,
        away: pending.away,
        home: pending.home,
        pickTeam: pending.pickTeam,
        pickSide: pending.pickSide,
        wasBestBet: pending.wasBestBet,
        aiResult,
        bestBetResult: pending.wasBestBet ? aiResult : null,
        awayScore: saved.awayScore,
        homeScore: saved.homeScore,
        settledAt: new Date().toISOString(),
      };

      delete day.pending[key];
    }
  }

  return store;
}

export function getResultsForGame(
  store: RecordsStore,
  slateDate: string,
  gamePk: number
): { aiResult: PickResult | null; bestBetResult: PickResult | null } {
  const entry = store.days[slateDate]?.settled[recordKey(gamePk)];
  if (!entry) return { aiResult: null, bestBetResult: null };
  return {
    aiResult: entry.aiResult,
    bestBetResult: entry.bestBetResult,
  };
}
