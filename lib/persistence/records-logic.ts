import type { BestBet, BestBetType } from "@/lib/best-bets";
import type {
  DayRecords,
  LockedGamePick,
  PickResult,
  RecordTotals,
  RecordsStore,
  ScoresStore,
} from "@/lib/persistence/types";
import {
  bestBetRecordKey,
  recordKey,
  scoreKey,
} from "@/lib/persistence/keys";

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

function settleMoneylinePick(
  pickSide: "away" | "home",
  awayWon: boolean
): PickResult {
  const pickWon = pickSide === "away" ? awayWon : !awayWon;
  return pickWon ? "win" : "loss";
}

function settleTotalsPick(
  totalsPick: "over" | "under",
  totalPoint: number,
  awayScore: number,
  homeScore: number
): PickResult {
  const runs = awayScore + homeScore;
  if (totalsPick === "over") return runs > totalPoint ? "win" : "loss";
  return runs < totalPoint ? "win" : "loss";
}

function gradeBestBet(
  bet: BestBet,
  awayWon: boolean,
  awayScore: number,
  homeScore: number
): PickResult {
  if (bet.betType === "moneyline") {
    return settleMoneylinePick(bet.pickSide, awayWon);
  }
  if (
    bet.betType === "total" &&
    bet.totalsPick &&
    bet.totalPoint !== null
  ) {
    return settleTotalsPick(
      bet.totalsPick,
      bet.totalPoint,
      awayScore,
      homeScore
    );
  }
  return "loss";
}

function isLegacyBestBetEntry(entry: {
  recordKind?: string;
  wasBestBet?: boolean;
}): boolean {
  return !entry.recordKind && Boolean(entry.wasBestBet);
}

/** Only count picks that were locked (have lockedAt). */
export function computeHistoricalTotals(store: RecordsStore): {
  bestBets: RecordTotals;
  aiPicks: RecordTotals;
} {
  const bestBets = { wins: 0, losses: 0 };
  const aiPicks = { wins: 0, losses: 0 };

  for (const day of Object.values(store.days)) {
    for (const entry of Object.values(day.settled)) {
      if (!entry.lockedAt) continue;

      if (entry.recordKind === "bestbet") {
        const result = entry.bestBetResult ?? entry.aiResult;
        if (result === "win") bestBets.wins++;
        else bestBets.losses++;
        continue;
      }

      if (isLegacyBestBetEntry(entry)) {
        if (entry.bestBetResult === "win") bestBets.wins++;
        else if (entry.bestBetResult === "loss") bestBets.losses++;
      }

      if (entry.recordKind === "ai" || !entry.recordKind) {
        if (entry.aiResult === "win") aiPicks.wins++;
        else aiPicks.losses++;
      }
    }
  }

  return { bestBets, aiPicks };
}

type GameForScores = {
  gamePk: number;
  away: string;
  home: string;
  isFinal: boolean;
  awayWon: boolean | null;
  awayScore: number | null;
  homeScore: number | null;
};

function upsertAiPending(
  day: DayRecords,
  slateDate: string,
  game: GameForScores,
  lock: LockedGamePick
): void {
  const key = recordKey(game.gamePk);
  if (day.settled[key] || day.pending[key]) return;

  day.pending[key] = {
    gamePk: game.gamePk,
    date: slateDate,
    away: lock.away,
    home: lock.home,
    pickTeam: lock.pickTeam,
    pickSide: lock.pickSide,
    recordKind: "ai",
    lockedAt: lock.lockedAt,
  };
}

function upsertBestBetPending(
  day: DayRecords,
  slateDate: string,
  game: GameForScores,
  bet: BestBet
): void {
  const key = bestBetRecordKey(bet.gamePk, bet.betType);
  if (day.settled[key] || day.pending[key]) return;

  const lockedAt = bet.lockedAt ?? new Date().toISOString();

  day.pending[key] = {
    gamePk: bet.gamePk,
    date: slateDate,
    away: bet.away,
    home: bet.home,
    pickTeam: bet.pickTeam,
    pickSide: bet.pickSide,
    recordKind: "bestbet",
    lockedAt,
    betType: bet.betType,
    totalsPick: bet.totalsPick,
    totalPoint: bet.totalPoint,
  };
}

function settleAiPending(
  day: DayRecords,
  key: string,
  pending: NonNullable<DayRecords["pending"][string]>,
  game: GameForScores
): void {
  if (!game.isFinal || game.awayWon === null) return;
  if (day.settled[key]) return;

  const aiResult = settleMoneylinePick(pending.pickSide, game.awayWon);

  day.settled[key] = {
    gamePk: pending.gamePk,
    date: pending.date,
    away: pending.away,
    home: pending.home,
    pickTeam: pending.pickTeam,
    pickSide: pending.pickSide,
    recordKind: "ai",
    lockedAt: pending.lockedAt,
    aiResult,
    bestBetResult: null,
    awayScore: game.awayScore ?? 0,
    homeScore: game.homeScore ?? 0,
    settledAt: new Date().toISOString(),
  };

  delete day.pending[key];
}

function settleBestBetPending(
  day: DayRecords,
  key: string,
  pending: NonNullable<DayRecords["pending"][string]>,
  game: GameForScores,
  bet: BestBet
): void {
  if (!game.isFinal || game.awayWon === null) return;
  if (day.settled[key]) return;

  const result = gradeBestBet(
    bet,
    game.awayWon,
    game.awayScore ?? 0,
    game.homeScore ?? 0
  );

  day.settled[key] = {
    gamePk: pending.gamePk,
    date: pending.date,
    away: pending.away,
    home: pending.home,
    pickTeam: pending.pickTeam,
    pickSide: pending.pickSide,
    recordKind: "bestbet",
    lockedAt: pending.lockedAt,
    betType: pending.betType,
    totalsPick: pending.totalsPick,
    totalPoint: pending.totalPoint,
    aiResult: result,
    bestBetResult: result,
    awayScore: game.awayScore ?? 0,
    homeScore: game.homeScore ?? 0,
    settledAt: new Date().toISOString(),
  };

  delete day.pending[key];
}

export function syncDayRecords(
  store: RecordsStore,
  slateDate: string,
  games: GameForScores[],
  lockedPicks: Record<string, LockedGamePick>,
  lockedBestBets: BestBet[]
): RecordsStore {
  const day = getDay(store, slateDate);
  const gamesByPk = new Map(games.map((g) => [g.gamePk, g]));

  for (const lock of Object.values(lockedPicks)) {
    const game = gamesByPk.get(lock.gamePk);
    if (!game) continue;

    upsertAiPending(day, slateDate, game, lock);

    const aiKey = recordKey(lock.gamePk);
    const aiPending = day.pending[aiKey];
    if (aiPending) {
      settleAiPending(day, aiKey, aiPending, game);
    }
  }

  for (const bet of lockedBestBets) {
    if (!bet.lockedAt) continue;

    const game = gamesByPk.get(bet.gamePk);
    if (!game) continue;

    upsertBestBetPending(day, slateDate, game, bet);

    const bbKey = bestBetRecordKey(bet.gamePk, bet.betType);
    const bbPending = day.pending[bbKey];
    if (bbPending) {
      settleBestBetPending(day, bbKey, bbPending, game, bet);
    }
  }

  return store;
}

/** Settle pending picks from earlier days when we have saved final scores. */
export function settlePendingFromScores(
  store: RecordsStore,
  scores: ScoresStore,
  lockedBestBetsByDate: Record<string, BestBet[]>
): RecordsStore {
  for (const [date, day] of Object.entries(store.days)) {
    const betsForDay = lockedBestBetsByDate[date] ?? [];
    const betsByKey = new Map(
      betsForDay.map((b) => [bestBetRecordKey(b.gamePk, b.betType), b])
    );

    for (const [key, pending] of Object.entries(day.pending)) {
      if (!pending.lockedAt) continue;

      const sk = scoreKey(date, pending.gamePk);
      const saved = scores[sk];
      if (!saved?.isFinal) continue;

      const awayWon = saved.awayScore > saved.homeScore;

      if (pending.recordKind === "bestbet") {
        const bet = betsByKey.get(key);
        if (!bet) continue;

        const result = gradeBestBet(
          bet,
          awayWon,
          saved.awayScore,
          saved.homeScore
        );

        day.settled[key] = {
          gamePk: pending.gamePk,
          date: pending.date,
          away: pending.away,
          home: pending.home,
          pickTeam: pending.pickTeam,
          pickSide: pending.pickSide,
          recordKind: "bestbet",
          lockedAt: pending.lockedAt,
          betType: pending.betType,
          totalsPick: pending.totalsPick,
          totalPoint: pending.totalPoint,
          aiResult: result,
          bestBetResult: result,
          awayScore: saved.awayScore,
          homeScore: saved.homeScore,
          settledAt: new Date().toISOString(),
        };
      } else {
        const aiResult = settleMoneylinePick(pending.pickSide, awayWon);

        day.settled[key] = {
          gamePk: pending.gamePk,
          date: pending.date,
          away: pending.away,
          home: pending.home,
          pickTeam: pending.pickTeam,
          pickSide: pending.pickSide,
          recordKind: "ai",
          lockedAt: pending.lockedAt,
          aiResult,
          bestBetResult: null,
          awayScore: saved.awayScore,
          homeScore: saved.homeScore,
          settledAt: new Date().toISOString(),
        };
      }

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
  if (!entry || entry.recordKind === "bestbet") {
    return { aiResult: null, bestBetResult: null };
  }
  return {
    aiResult: entry.aiResult,
    bestBetResult: entry.bestBetResult,
  };
}

export function getBestBetResult(
  store: RecordsStore,
  slateDate: string,
  gamePk: number,
  betType: BestBetType
): PickResult | null {
  const entry =
    store.days[slateDate]?.settled[bestBetRecordKey(gamePk, betType)];
  if (!entry || entry.recordKind !== "bestbet") return null;
  return entry.bestBetResult ?? entry.aiResult;
}
