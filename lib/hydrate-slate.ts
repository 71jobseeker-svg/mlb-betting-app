import "server-only";

import type { BestBet } from "@/lib/best-bets";
import type { EnrichedGame } from "@/lib/games";
import {
  isRecordsPaused,
  ZERO_TOTALS,
} from "@/lib/persistence/reset";
import {
  computeHistoricalTotals,
  getBestBetResult,
  getResultsForGame,
  settlePendingFromScores,
  syncDayRecords,
} from "@/lib/persistence/records-logic";
import {
  mergeScoresIntoGames,
  persistFinalScores,
} from "@/lib/persistence/scores-logic";
import {
  loadLockedPicks,
  loadMeta,
  loadRecordsStore,
  loadScoresStore,
  saveRecordsStore,
  saveScoresStore,
} from "@/lib/persistence/store";
import type { RecordTotals, RecordsStore } from "@/lib/persistence/types";

function inferAwayWon(games: EnrichedGame[]): EnrichedGame[] {
  return games.map((g) => {
    if (
      g.isFinal &&
      g.awayWon === null &&
      g.awayScore !== null &&
      g.homeScore !== null
    ) {
      return { ...g, awayWon: g.awayScore > g.homeScore };
    }
    return g;
  });
}

function applyRecordResults(
  games: EnrichedGame[],
  slateDate: string,
  store: RecordsStore
): EnrichedGame[] {
  return games.map((game) => {
    const { aiResult, bestBetResult } = getResultsForGame(
      store,
      slateDate,
      game.gamePk
    );
    return { ...game, aiResult, bestBetResult };
  });
}

function applyBestBetResults(
  bestBets: BestBet[],
  slateDate: string,
  store: RecordsStore
): BestBet[] {
  return bestBets.map((bet) => ({
    ...bet,
    bestBetResult:
      getBestBetResult(store, slateDate, bet.gamePk, bet.betType) ??
      bet.bestBetResult ??
      null,
  }));
}

export async function hydrateSlate(
  slateDate: string,
  games: EnrichedGame[],
  lockedBestBets: BestBet[]
): Promise<{
  games: EnrichedGame[];
  bestBets: BestBet[];
  totals: { bestBets: RecordTotals; aiPicks: RecordTotals };
}> {
  const meta = await loadMeta();
  const paused = isRecordsPaused(slateDate, meta);

  let scoresStore = await loadScoresStore();
  let merged = mergeScoresIntoGames(games, slateDate, scoresStore);
  merged = inferAwayWon(merged);

  if (paused) {
    const gamesWithoutResults = merged.map((g) => ({
      ...g,
      aiResult: null,
      bestBetResult: null,
    }));

    return {
      games: gamesWithoutResults,
      bestBets: lockedBestBets,
      totals: ZERO_TOTALS,
    };
  }

  const lockedPicksStore = await loadLockedPicks(slateDate);
  const lockedPicks = lockedPicksStore.picks ?? {};

  let recordsStore = await loadRecordsStore();

  scoresStore = persistFinalScores(merged, slateDate, scoresStore);
  await saveScoresStore(scoresStore);

  const bestBetsLocked = lockedBestBets.filter((b) => b.lockedAt);

  recordsStore = settlePendingFromScores(recordsStore, scoresStore, {
    [slateDate]: bestBetsLocked,
  });

  recordsStore = syncDayRecords(
    recordsStore,
    slateDate,
    merged,
    lockedPicks,
    bestBetsLocked
  );
  await saveRecordsStore(recordsStore);

  merged = applyRecordResults(merged, slateDate, recordsStore);
  const bestBets = applyBestBetResults(
    lockedBestBets,
    slateDate,
    recordsStore
  );
  const totals = computeHistoricalTotals(recordsStore);

  return { games: merged, bestBets, totals };
}
