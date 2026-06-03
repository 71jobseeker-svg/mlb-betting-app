import "server-only";

import type { BestBet } from "@/lib/best-bets";
import {
  canGenerateAndLockPicks,
  gameHasMoneylineOdds,
  isLockedBestBetsValid,
  isValidLockedGamePick,
} from "@/lib/slate-picks-ready";
import type { EnrichedGame } from "@/lib/games";
import type { LockedGamePick } from "@/lib/persistence/types";
import { recordKey } from "@/lib/persistence/keys";
import {
  loadLockedBestBets,
  loadLockedPicks,
  saveLockedBestBets,
  saveLockedPicks,
} from "@/lib/persistence/store";

function gameToLockedPick(
  game: EnrichedGame,
  slateDate: string,
  lockedAt: string
): LockedGamePick {
  return {
    gamePk: game.gamePk,
    slateDate,
    lockedAt,
    pickTeam: game.pickTeam,
    pickSide: game.pickSide,
    pickOdds: game.pickOdds,
    recommendation: game.recommendation,
    moneylineStatEdge: game.moneylineStatEdge,
    totalsPick: game.totalsPick,
    totalsRecommendation: game.totalsRecommendation,
    totalsStatEdge: game.totalsStatEdge,
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
  return {
    ...game,
    picksAvailable: true,
    pickTeam: lock.pickTeam,
    pickSide: lock.pickSide,
    pickOdds: lock.pickOdds,
    recommendation: lock.recommendation,
    moneylineStatEdge: lock.moneylineStatEdge ?? game.moneylineStatEdge,
    totalsPick: lock.totalsPick,
    totalsRecommendation: lock.totalsRecommendation,
    totalsStatEdge: lock.totalsStatEdge,
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

/**
 * Lock best bets only after 8am PT when at least one pickable game has odds.
 * Replaces invalid early locks (blank odds / pre-8am).
 */
export async function applyLockedBestBets(
  slateDate: string,
  suggested: BestBet[],
  games: EnrichedGame[]
): Promise<BestBet[]> {
  const existing = await loadLockedBestBets(slateDate);

  if (existing && existing.length > 0 && isLockedBestBetsValid(existing)) {
    return existing;
  }

  if (!canGenerateAndLockPicks(games) || suggested.length === 0) {
    return [];
  }

  const lockedAt = new Date().toISOString();
  const locked = suggested.map((bet) => ({ ...bet, lockedAt }));
  await saveLockedBestBets(slateDate, locked);
  return locked;
}
