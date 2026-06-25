import type { BestBet } from "@/lib/best-bets";
import type { EnrichedGame } from "@/lib/games";
import {
  formatPacificTime,
  getPacificTimeParts,
  isAfter8amPacific,
} from "@/lib/date";
import { formatAmericanOdds } from "@/lib/odds";
import type { LockedGamePick } from "@/lib/persistence/types";

export const MIN_TOTALS_EDGE = 7;

export type TotalBetCandidate = {
  game: EnrichedGame;
  betLabel: string;
  betOdds: number;
  edge: number;
  reason: string;
  score: number;
  totalsPick: "over" | "under";
};

type CollectTotalOptions = {
  minEdge: number | null;
  requireTotalsPick: boolean;
};

function resolveTotalsSide(
  game: EnrichedGame
): { pick: "over" | "under"; betOdds: number } | null {
  const { totalsPick, overPrice, underPrice } = game;

  if (totalsPick === "over" && overPrice !== null) {
    return { pick: "over", betOdds: overPrice };
  }
  if (totalsPick === "under" && underPrice !== null) {
    return { pick: "under", betOdds: underPrice };
  }
  if (!totalsPick) {
    if (overPrice !== null) return { pick: "over", betOdds: overPrice };
    if (underPrice !== null) return { pick: "under", betOdds: underPrice };
  }
  return null;
}

function compareTotalCandidates(
  a: TotalBetCandidate,
  b: TotalBetCandidate
): number {
  if (b.edge !== a.edge) return b.edge - a.edge;
  return b.game.gamePk - a.game.gamePk;
}

/** O/U bucket — filters by confidence threshold and optional AI totalsPick requirement. */
export function collectTotalCandidates(
  games: EnrichedGame[],
  options: CollectTotalOptions = { minEdge: MIN_TOTALS_EDGE, requireTotalsPick: true }
): TotalBetCandidate[] {
  const bucket: TotalBetCandidate[] = [];

  for (const game of games) {
    if (game.totalPoint === null) continue;
    if (options.requireTotalsPick && !game.totalsPick) continue;

    const side = resolveTotalsSide(game);
    if (!side) continue;

    const edge = game.totalsStatEdge;
    if (options.minEdge !== null && edge < options.minEdge) continue;

    const betLabel = `${side.pick === "over" ? "Over" : "Under"} ${game.totalPoint}`;

    bucket.push({
      game,
      betLabel,
      betOdds: side.betOdds,
      edge,
      score: Math.max(edge, 1) / 10,
      totalsPick: side.pick,
      reason:
        game.totalsRecommendation ??
        `AI sees ${edge}/10 statistical edge on the ${betLabel} (${formatAmericanOdds(side.betOdds)}).`,
    });
  }

  const sorted = bucket.sort(compareTotalCandidates);
  console.warn(
    `[BestBets] collectTotalCandidates found ${sorted.length} after filtering (minEdge=${options.minEdge}, requireTotalsPick=${options.requireTotalsPick})`
  );
  return sorted;
}

/** Full O/U pool using the same tiered fallback as pickBestTotalBet. */
export function getTotalCandidatePool(
  games: EnrichedGame[]
): TotalBetCandidate[] {
  let bucket = collectTotalCandidates(games, {
    minEdge: MIN_TOTALS_EDGE,
    requireTotalsPick: true,
  });

  if (bucket.length === 0) {
    console.warn(
      "[BestBets] No totals at 7+ edge — re-running with confidence threshold removed."
    );
    bucket = collectTotalCandidates(games, {
      minEdge: null,
      requireTotalsPick: true,
    });
  }

  if (bucket.length === 0) {
    console.warn(
      "[BestBets] Still no totals with AI pick — selecting highest-confidence O/U from full slate."
    );
    bucket = collectTotalCandidates(games, {
      minEdge: null,
      requireTotalsPick: false,
    });
  }

  return bucket;
}

/** Best O/U pick with tiered fallback — never returns a moneyline bet. */
export function pickBestTotalBet(
  games: EnrichedGame[]
): TotalBetCandidate | undefined {
  return getTotalCandidatePool(games)[0];
}

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

export function gameHasMoneylineOdds(game: GameWithOdds): boolean {
  return game.awayMoneyline !== null && game.homeMoneyline !== null;
}

/** Every pickable game has moneyline odds (diagnostics / full-slate messaging). */
export function hasFullSlateMoneylineOdds(games: GameWithOdds[]): boolean {
  const pickable = games.filter(isPickableGame);
  if (pickable.length === 0) return false;

  const withOdds = pickable.filter(gameHasMoneylineOdds);
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
    if (gameHasMoneylineOdds(g)) {
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

/** At least one pickable game has moneyline odds — enough to publish partial picks. */
export function hasAnyPickableMoneylineOdds(games: GameWithOdds[]): boolean {
  return countOddsCoverage(games).withOdds > 0;
}

/** 8:00 AM PT + moneyline odds on at least one pickable game. */
export function canGenerateAndLockPicks(games: GameWithOdds[]): boolean {
  return isAfter8amPacific() && hasAnyPickableMoneylineOdds(games);
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
  if (!hasAnyPickableMoneylineOdds(games)) {
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
    // Partial slate: never block the UI when any pickable game already has lines.
    if (withOdds > 0) return null;

    const sample = missing
      .slice(0, 3)
      .map((m) => `${m.away} @ ${m.home}`)
      .join(", ");
    return `Waiting for moneyline odds (${withOdds}/${pickable} games have lines${sample ? `; missing: ${sample}` : ""}). Check ODDS_API_KEY in .env.local and deployment env if this persists.`;
  }
  return "Waiting for moneyline odds before publishing picks and Best Bets.";
}

export function isValidLockedGamePick(lock: LockedGamePick): boolean {
  if (!lock.lockedAt) return false;

  const locked = new Date(lock.lockedAt);
  if (Number.isNaN(locked.getTime())) return false;

  const { hour } = getPacificTimeParts(locked);
  if (hour < 8) return false;

  return lock.pickOdds !== null;
}

export const EXPECTED_BEST_BETS_COUNT = 3;

function hasExpectedBestBetCategories(bets: BestBet[]): boolean {
  if (bets.length !== EXPECTED_BEST_BETS_COUNT) return false;

  const totals = bets.filter((bet) => bet.betCategory === "total");
  const favorites = bets.filter((bet) => bet.betCategory === "favorite");
  const underdogs = bets.filter((bet) => bet.betCategory === "underdog");

  return (
    totals.length === 1 &&
    favorites.length === 1 &&
    underdogs.length === 1
  );
}

export function isLockedBestBetsValid(bets: BestBet[]): boolean {
  if (!hasExpectedBestBetCategories(bets)) return false;

  for (const bet of bets) {
    if (!bet.lockedAt) return false;

    const locked = new Date(bet.lockedAt);
    if (Number.isNaN(locked.getTime())) return false;

    const { hour } = getPacificTimeParts(locked);
    if (hour < 8) return false;

    if (bet.betType === "moneyline") {
      if (bet.betOdds === null) return false;
      if (bet.awayMoneyline === null || bet.homeMoneyline === null) return false;
      if (bet.betCategory === "favorite" && bet.betOdds >= 0) return false;
      if (bet.betCategory === "underdog" && bet.betOdds <= 0) return false;
    }

    if (bet.betType === "total") {
      if (
        bet.betOdds === null ||
        bet.totalPoint === null ||
        !bet.totalsPick
      ) {
        return false;
      }
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
  const hasValidBestBetLocks =
    locked.length > 0 && isLockedBestBetsValid(locked);
  const hasValidGamePickLocks = games.some(
    (g) => g.picksAvailable && g.pickOdds !== null
  );
  return resolveSlatePicksStatus(
    games,
    hasValidBestBetLocks || hasValidGamePickLocks
  );
}
