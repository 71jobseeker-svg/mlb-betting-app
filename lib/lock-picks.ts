import "server-only";

import { buildTotalBestBet } from "@/lib/best-bets";
import type { BestBet } from "@/lib/best-bets";
import {
  generateBettingRecommendations,
  type GameForAnalysis,
} from "@/lib/analysis";
import {
  canGenerateAndLockPicks,
  gameHasMoneylineOdds,
  hasValidLockedTotalsFields,
  isLockedBestBetsValid,
  isValidLockedGamePick,
  MIN_TOTALS_EDGE,
  pickBestTotalBetExcluding,
} from "@/lib/slate-picks-ready";
import type { EnrichedGame } from "@/lib/games";
import type { LockedGamePick } from "@/lib/persistence/types";
import { bestBetsKey, recordKey } from "@/lib/persistence/keys";
import { clearBestBetTotalRecord } from "@/lib/persistence/records-logic";
import {
  loadLockedBestBets,
  loadLockedPicks,
  loadRecordsStore,
  saveLockedBestBets,
  saveLockedPicks,
  saveRecordsStore,
} from "@/lib/persistence/store";

function gameToLockedPick(
  game: EnrichedGame,
  slateDate: string,
  lockedAt: string
): LockedGamePick {
  const lockTotals =
    game.totalsPick != null && game.totalsStatEdge >= MIN_TOTALS_EDGE;

  return {
    gamePk: game.gamePk,
    slateDate,
    lockedAt,
    pickTeam: game.pickTeam,
    pickSide: game.pickSide,
    pickOdds: game.pickOdds,
    recommendation: game.recommendation,
    moneylineStatEdge: game.moneylineStatEdge,
    totalsPick: lockTotals ? game.totalsPick : null,
    totalsRecommendation: lockTotals ? game.totalsRecommendation : null,
    totalsStatEdge: lockTotals ? game.totalsStatEdge : 0,
    runLineTeam: game.runLineTeam,
    runLinePickSide: game.runLinePickSide,
    runLineSpread: game.runLineSpread ?? 0,
    runLineOdds: game.runLineOdds,
    runLineRecommendation: game.runLineRecommendation ?? "",
    runLineStatEdge: game.runLineStatEdge,
    away: game.away,
    home: game.home,
  };
}

function mergeLockedIntoGame(
  game: EnrichedGame,
  lock: LockedGamePick
): EnrichedGame {
  const useLockedTotals = hasValidLockedTotalsFields(lock);

  return {
    ...game,
    picksAvailable: true,
    pickTeam: lock.pickTeam,
    pickSide: lock.pickSide,
    pickOdds: lock.pickOdds,
    recommendation: lock.recommendation,
    moneylineStatEdge: lock.moneylineStatEdge ?? game.moneylineStatEdge,
    totalsPick: useLockedTotals ? lock.totalsPick : game.totalsPick,
    totalsRecommendation: useLockedTotals
      ? lock.totalsRecommendation
      : game.totalsRecommendation,
    totalsStatEdge: useLockedTotals
      ? lock.totalsStatEdge
      : game.totalsStatEdge,
    runLineTeam: lock.runLineTeam ?? game.runLineTeam,
    runLinePickSide: lock.runLinePickSide ?? game.runLinePickSide,
    runLineSpread: lock.runLineSpread ?? game.runLineSpread,
    runLineOdds: lock.runLineOdds ?? game.runLineOdds,
    runLineRecommendation:
      lock.runLineRecommendation ?? game.runLineRecommendation,
    runLineStatEdge: lock.runLineStatEdge ?? game.runLineStatEdge,
  };
}

/**
 * Apply persisted locks: never overwrite an existing valid pick for today.
 * New picks lock only after 8:00 AM PT when at least one pickable game has odds.
 */
export async function applyLockedPicks(
  slateDate: string,
  freshGames: EnrichedGame[],
  picksReady: boolean
): Promise<EnrichedGame[]> {
  const store = await loadLockedPicks(slateDate);
  const picks = store.picks ?? {};
  const canLockNew = picksReady;
  let dirty = false;
  const lockedAt = new Date().toISOString();

  const games = freshGames.map((game) => {
    const key = recordKey(game.gamePk);
    const existing = picks[key];

    if (existing && isValidLockedGamePick(existing)) {
      return mergeLockedIntoGame(game, existing);
    }

    if (!canLockNew || !gameHasMoneylineOdds(game) || game.pickOdds === null) {
      return game;
    }

    picks[key] = gameToLockedPick(game, slateDate, lockedAt);
    dirty = true;
    return { ...game, picksAvailable: true };
  });

  if (dirty) {
    await saveLockedPicks(slateDate, { picks });
  }

  return games;
}

function gameToAnalysisShell(game: EnrichedGame): GameForAnalysis {
  return {
    gamePk: game.gamePk,
    away: game.away,
    home: game.home,
    status: game.status,
    startTime: game.startTime,
    awayMoneyline: game.awayMoneyline,
    homeMoneyline: game.homeMoneyline,
    awayRunLinePoint: game.awayRunLinePoint,
    awayRunLinePrice: game.awayRunLinePrice,
    homeRunLinePoint: game.homeRunLinePoint,
    homeRunLinePrice: game.homeRunLinePrice,
    totalPoint: game.totalPoint,
    overPrice: game.overPrice,
    underPrice: game.underPrice,
  };
}

/** Fresh AI totals fields for best-bet selection (ignores stale per-game lock totals). */
async function overlayFreshTotalsAnalysis(
  games: EnrichedGame[]
): Promise<EnrichedGame[]> {
  const shells = games
    .filter((g) => gameHasMoneylineOdds(g))
    .map(gameToAnalysisShell);

  if (shells.length === 0) return games;

  const recommendations = await generateBettingRecommendations(shells);

  return games.map((game) => {
    const analysis = recommendations.get(game.gamePk);
    if (!analysis) return game;

    return {
      ...game,
      totalsPick: analysis.totalsPick,
      totalsStatEdge: analysis.totalsStatEdge,
      totalsRecommendation: analysis.totalsRecommendation,
    };
  });
}

/**
 * Replace only the locked O/U best bet. ML favorite and underdog locks are kept as-is.
 * Clears the prior total's W-L record entry for today when the game changes.
 */
export async function refreshLockedTotalBestBet(
  slateDate: string,
  games: EnrichedGame[]
): Promise<BestBet[] | null> {
  const existing = await loadLockedBestBets(slateDate);
  if (!existing?.length) {
    console.warn(`[refreshTotal] No locked best bets for ${slateDate}`);
    return null;
  }

  const favorite = existing.find((b) => b.betCategory === "favorite");
  const underdog = existing.find((b) => b.betCategory === "underdog");
  const oldTotal = existing.find((b) => b.betCategory === "total");

  if (!favorite || !underdog) {
    console.warn("[refreshTotal] Missing ML favorite/underdog locks — cannot refresh total only");
    return null;
  }

  const gamesForTotals = await overlayFreshTotalsAnalysis(games);
  const excludeGamePks = new Set([favorite.gamePk, underdog.gamePk]);
  const candidate = pickBestTotalBetExcluding(gamesForTotals, excludeGamePks);

  if (!candidate) {
    console.warn("[refreshTotal] No O/U candidate found on slate");
    return null;
  }

  const lockedAt = new Date().toISOString();
  const newTotal = { ...buildTotalBestBet(candidate, 1), lockedAt };

  const refreshed: BestBet[] = [
    newTotal,
    { ...underdog, rank: 2 },
    { ...favorite, rank: 3 },
  ];

  if (oldTotal) {
    let records = await loadRecordsStore();
    records = clearBestBetTotalRecord(records, slateDate, oldTotal.gamePk);
    await saveRecordsStore(records);
    console.warn(
      `[refreshTotal] Cleared best-bet record for total gamePk ${oldTotal.gamePk}`
    );
  }

  await saveLockedBestBets(slateDate, refreshed);

  console.warn(
    `[refreshTotal] Updated ${bestBetsKey(slateDate)} — O/U: ${newTotal.betLabel} @ ${newTotal.betOdds} (${newTotal.totalsStatEdge}/10 edge, score ${newTotal.statScore})`
  );

  return refreshed;
}

/**
 * Lock best bets only after 8am PT when at least one pickable game has odds.
 * Replaces invalid early locks (blank odds / pre-8am / wrong count).
 */
export async function applyLockedBestBets(
  slateDate: string,
  suggested: BestBet[],
  games: EnrichedGame[]
): Promise<BestBet[]> {
  const existing = await loadLockedBestBets(slateDate);

  if (existing && isLockedBestBetsValid(existing)) {
    return existing;
  }

  if (!canGenerateAndLockPicks(games) || suggested.length === 0) {
    return existing && existing.length > 0 ? existing : [];
  }

  const lockedAt = new Date().toISOString();
  const locked = suggested.map((bet) => ({ ...bet, lockedAt }));
  await saveLockedBestBets(slateDate, locked);
  return locked;
}
