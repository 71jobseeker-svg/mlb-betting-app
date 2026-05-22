import "server-only";

import type { BestBet } from "@/lib/best-bets";
import { getBestBetGamePks } from "@/lib/best-bets";
import type { EnrichedGame } from "@/lib/games";
import {
  computeHistoricalTotals,
  getResultsForGame,
  settlePendingFromScores,
  syncDayRecords,
} from "@/lib/persistence/records-logic";
import {
  mergeScoresIntoGames,
  persistFinalScores,
} from "@/lib/persistence/scores-logic";
import {
  loadLockedBestBets,
  loadRecordsStore,
  loadScoresStore,
  saveLockedBestBets,
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

export async function hydrateSlate(
  slateDate: string,
  games: EnrichedGame[],
  suggestedBestBets: BestBet[]
): Promise<{
  games: EnrichedGame[];
  bestBets: BestBet[];
  totals: { bestBets: RecordTotals; aiPicks: RecordTotals };
}> {
  let recordsStore = await loadRecordsStore();
  let scoresStore = await loadScoresStore();

  let merged = mergeScoresIntoGames(games, slateDate, scoresStore);
  merged = inferAwayWon(merged);

  scoresStore = persistFinalScores(merged, slateDate, scoresStore);
  await saveScoresStore(scoresStore);

  const locked = await loadLockedBestBets(slateDate);
  const bestBets = locked ?? suggestedBestBets;
  if (!locked) {
    await saveLockedBestBets(slateDate, suggestedBestBets);
  }

  recordsStore = settlePendingFromScores(recordsStore, scoresStore);
  const bestBetGamePks = getBestBetGamePks(bestBets);
  recordsStore = syncDayRecords(
    recordsStore,
    slateDate,
    merged,
    bestBetGamePks
  );
  await saveRecordsStore(recordsStore);

  merged = applyRecordResults(merged, slateDate, recordsStore);
  const totals = computeHistoricalTotals(recordsStore);

  return { games: merged, bestBets, totals };
}
