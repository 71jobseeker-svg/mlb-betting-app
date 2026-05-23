import type { BestBet } from "@/lib/best-bets";
import type { EnrichedGame } from "@/lib/games";
import { getPacificTimeParts, isAfter8amPacific } from "@/lib/date";

export type BestBetsStatus =
  | { type: "ready" }
  | { type: "pending"; reason: "before-8am" | "awaiting-odds" };

export function hasFullSlateMoneylineOdds(games: EnrichedGame[]): boolean {
  if (games.length === 0) return false;
  return games.every(
    (g) => g.awayMoneyline !== null && g.homeMoneyline !== null
  );
}

export function canSelectAndLockBestBets(games: EnrichedGame[]): boolean {
  return isAfter8amPacific() && hasFullSlateMoneylineOdds(games);
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

export function resolveBestBetsStatus(
  games: EnrichedGame[],
  locked: BestBet[]
): BestBetsStatus {
  if (locked.length > 0 && isLockedBestBetsValid(locked)) {
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

export function bestBetsPendingMessage(status: BestBetsStatus): string | null {
  if (status.type !== "pending") return null;
  if (status.reason === "before-8am") {
    return "Best Bets unlock at 8:00 AM PT once moneyline odds are posted for the full slate.";
  }
  return "Waiting for moneyline odds on all games before selecting today’s Best Bets.";
}
