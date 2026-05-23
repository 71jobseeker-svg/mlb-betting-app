import type { BestBet } from "@/lib/best-bets";
import type { EnrichedGame } from "@/lib/games";
import {
  formatPacificTime,
  getPacificTimeParts,
  isAfter8amPacific,
} from "@/lib/date";
import type { LockedGamePick } from "@/lib/persistence/types";

export type SlatePicksStatus =
  | { type: "ready" }
  | { type: "pending"; reason: "before-8am" | "awaiting-odds" };

type GameWithOdds = {
  awayMoneyline: number | null;
  homeMoneyline: number | null;
  isFinal?: boolean;
  status?: string;
};

export function isPickableGame(game: {
  isFinal?: boolean;
  status?: string;
}): boolean {
  if (game.isFinal) return false;
  const s = (game.status ?? "").toLowerCase();
  if (s.includes("cancel")) return false;
  if (s.includes("postponed")) return false;
  return true;
}

/** Odds required only for games still on today's pickable slate (not finals). */
export function hasFullSlateMoneylineOdds(games: GameWithOdds[]): boolean {
  const pickable = games.filter(isPickableGame);
  if (pickable.length === 0) return false;

  const withOdds = pickable.filter(
    (g) => g.awayMoneyline !== null && g.homeMoneyline !== null
  );

  return withOdds.length === pickable.length;
}

export function countOddsCoverage(
  games: Array<
    GameWithOdds & {
      away?: string;
      home?: string;
    }
  >
): {
  pickable: number;
  withOdds: number;
  missing: Array<{ away: string; home: string }>;
} {
  const pickable = games.filter(isPickableGame);
  const missing: Array<{ away: string; home: string }> = [];

  let withOdds = 0;
  for (const g of pickable) {
    if (g.awayMoneyline !== null && g.homeMoneyline !== null) {
      withOdds++;
    } else {
      missing.push({
        away: g.away ?? "?",
        home: g.home ?? "?",
      });
    }
  }

  return { pickable: pickable.length, withOdds, missing };
}

/** 8:00 AM PT + moneyline odds for every pickable game. */
export function canGenerateAndLockPicks(games: GameWithOdds[]): boolean {
  return isAfter8amPacific() && hasFullSlateMoneylineOdds(games);
}

export function resolveSlatePicksStatus(
  games: GameWithOdds[],
  hasValidLocks: boolean
): SlatePicksStatus {
  if (hasValidLocks) {
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
  status: SlatePicksStatus,
  games?: GameWithOdds[]
): string | null {
  if (status.type !== "pending") return null;
  if (status.reason === "before-8am") {
    const { hour, minute } = getPacificTimeParts();
    return `AI picks and Best Bets unlock at 8:00 AM PT (now ${formatPacificTime()}). Current PT time: ${hour}:${String(minute).padStart(2, "0")}.`;
  }
  if (games) {
    const { pickable, withOdds, missing } = countOddsCoverage(
      games as Array<GameWithOdds & { away: string; home: string }>
    );
    const sample = missing
      .slice(0, 3)
      .map((m) => `${m.away} @ ${m.home}`)
      .join(", ");
    return `Waiting for moneyline odds on all pickable games (${withOdds}/${pickable} have lines${sample ? `; missing: ${sample}` : ""}).`;
  }
  return "Waiting for moneyline odds on all pickable games before publishing picks and Best Bets.";
}

export function isValidLockedGamePick(lock: LockedGamePick): boolean {
  if (!lock.lockedAt) return false;

  const locked = new Date(lock.lockedAt);
  if (Number.isNaN(locked.getTime())) return false;

  const { hour } = getPacificTimeParts(locked);
  if (hour < 8) return false;

  return lock.pickOdds !== null;
}

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
