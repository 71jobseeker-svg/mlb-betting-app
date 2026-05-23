import type { BestBet } from "@/lib/best-bets";
import type { EnrichedGame } from "@/lib/games";
import { getPacificTimeParts, isAfter8amPacific } from "@/lib/date";
import type { LockedGamePick } from "@/lib/persistence/types";

export type SlatePicksStatus =
  | { type: "ready" }
  | { type: "pending"; reason: "before-8am" | "awaiting-odds" };

type GameWithOdds = {
  awayMoneyline: number | null;
  homeMoneyline: number | null;
};

export function hasFullSlateMoneylineOdds(
  games: GameWithOdds[]
): boolean {
  if (games.length === 0) return false;
  return games.every(
    (g) => g.awayMoneyline !== null && g.homeMoneyline !== null
  );
}

/** 8:00 AM PT + moneyline odds posted for every game on the slate. */
export function canGenerateAndLockPicks(games: GameWithOdds[]): boolean {
  return isAfter8amPacific() && hasFullSlateMoneylineOdds(games);
}

export function resolveSlatePicksStatus(
  games: GameWithOdds[],
  hasValidLocks: boolean
): SlatePicksStatus {
  if (hasValidLocks && canGenerateAndLockPicks(games)) {
    return { type: "ready" };
  }
  if (!isAfter8amPacific()) {
    return { type: "pending", reason: "before-8am" };
  }
  if (!hasFullSlateMoneylineOdds(games)) {
    return { type: "pending", reason: "awaiting-odds" };
  }
  return { type: "ready" };
}

export function slatePicksPendingMessage(
  status: SlatePicksStatus
): string | null {
  if (status.type !== "pending") return null;
  if (status.reason === "before-8am") {
    return "AI moneyline picks, totals picks, and Best Bets unlock at 8:00 AM PT once moneyline odds are posted for the full slate.";
  }
  return "Waiting for moneyline odds on all games before publishing picks and Best Bets.";
}

/** @deprecated Use slatePicksPendingMessage */
export function bestBetsPendingMessage(
  status: SlatePicksStatus
): string | null {
  return slatePicksPendingMessage(status);
}

export type BestBetsStatus = SlatePicksStatus;

export function isValidLockedGamePick(lock: LockedGamePick): boolean {
  if (!lock.lockedAt) return false;

  const locked = new Date(lock.lockedAt);
  if (Number.isNaN(locked.getTime())) return false;

  const { hour } = getPacificTimeParts(locked);
  if (hour < 8) return false;

  return lock.pickOdds !== null;
}

/** Reject early/invalid locks (blank odds, before 8am PT). */
export function isLockedBestBetsValid(bets: BestBet[]): boolean {
  if (!bets.length) return false;

  for (const bet of bets) {
    if (!bet.lockedAt) return false;

    const locked = new Date(bet.lockedAt);
    if (Number.isNaN(locked.getTime())) return false;

    const { hour } = getPacificTimeParts(locked);
    if (hour < 8) return false;

    if (bet.betType === "moneyline") {
      if (bet.betOdds === null) return false;
      if (bet.awayMoneyline === null || bet.homeMoneyline === null) return false;
    }

    if (bet.betType === "total") {
      if (bet.betOdds === null || bet.totalPoint === null) return false;
    }

    if (bet.statScore <= 0) return false;
  }

  return true;
}

export function canSelectAndLockBestBets(games: EnrichedGame[]): boolean {
  return canGenerateAndLockPicks(games);
}

export function resolveBestBetsStatus(
  games: EnrichedGame[],
  locked: BestBet[]
): SlatePicksStatus {
  const hasValidLocks =
    locked.length > 0 && isLockedBestBetsValid(locked);
  return resolveSlatePicksStatus(games, hasValidLocks);
}
