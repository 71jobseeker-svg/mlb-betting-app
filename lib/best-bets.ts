import type { EnrichedGame } from "@/lib/games";
import {
  EXPECTED_BEST_BETS_COUNT,
  pickBestTotalBet,
  type TotalBetCandidate,
} from "@/lib/slate-picks-ready";

export type BestBetType = "moneyline" | "total";

export type BestBetCategory = "total" | "favorite" | "underdog";

export type BestBet = EnrichedGame & {
  rank: number;
  betType: BestBetType;
  betCategory: BestBetCategory;
  betLabel: string;
  betOdds: number | null;
  statReason: string;
  statScore: number;
  /** Set when best bets are locked for the slate day */
  lockedAt?: string;
  /** Graded from locked snapshot after final */
  bestBetResult?: "win" | "loss" | "push" | null;
};

type MoneylineCandidate = {
  game: EnrichedGame;
  betLabel: string;
  betOdds: number;
  edge: number;
  reason: string;
  score: number;
};

function formatLine(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

function compareByEdgeThenGamePk<
  T extends { edge: number; game: EnrichedGame },
>(a: T, b: T): number {
  if (b.edge !== a.edge) return b.edge - a.edge;
  return b.game.gamePk - a.game.gamePk;
}

function totalCandidateToBestBet(
  candidate: TotalBetCandidate,
  rank: number
): BestBet {
  return {
    ...candidate.game,
    rank,
    betType: "total",
    betCategory: "total",
    betLabel: candidate.betLabel,
    betOdds: candidate.betOdds,
    statReason: candidate.reason,
    statScore: candidate.score,
    totalsPick: candidate.totalsPick,
  };
}

function moneylineCandidateToBestBet(
  candidate: MoneylineCandidate,
  betCategory: "favorite" | "underdog",
  rank: number
): BestBet {
  const side =
    candidate.betLabel === candidate.game.away
      ? ("away" as const)
      : ("home" as const);
  return {
    ...candidate.game,
    rank,
    betType: "moneyline",
    betCategory,
    betLabel: candidate.betLabel,
    betOdds: candidate.betOdds,
    statReason: candidate.reason,
    statScore: candidate.score,
    pickTeam: candidate.betLabel,
    pickSide: side,
    pickOdds: candidate.betOdds,
  };
}

/**
 * Favorite bucket: market favorite side (negative ML) on each game.
 * Uses full ML edge when the AI pick aligns with that favorite side.
 */
function collectFavoriteCandidates(games: EnrichedGame[]): MoneylineCandidate[] {
  const bucket: MoneylineCandidate[] = [];

  for (const game of games) {
    const { away, home, awayMoneyline, homeMoneyline, pickSide, moneylineStatEdge } =
      game;

    if (awayMoneyline === null || homeMoneyline === null) continue;

    const awayIsFavorite = awayMoneyline < homeMoneyline;
    const favTeam = awayIsFavorite ? away : home;
    const favOdds = awayIsFavorite ? awayMoneyline : homeMoneyline;
    const favSide = awayIsFavorite ? ("away" as const) : ("home" as const);

    if (favOdds >= 0) continue;

    const aiOnFavorite = pickSide === favSide;
    const edge = aiOnFavorite ? moneylineStatEdge : 0;

    bucket.push({
      game,
      betLabel: favTeam,
      betOdds: favOdds,
      edge,
      score: Math.max(edge, 1) / 10,
      reason: aiOnFavorite
        ? `AI ML favorite: ${favTeam} ${formatLine(favOdds)} — ${edge}/10 edge.`
        : `Market favorite: ${favTeam} ${formatLine(favOdds)} — ${edge}/10 AI edge on this side.`,
    });
  }

  return bucket.sort(compareByEdgeThenGamePk);
}

/**
 * Underdog bucket: market underdog side (positive ML) on each game.
 * Uses full ML edge when the AI pick aligns with that underdog side.
 */
function collectUnderdogCandidates(games: EnrichedGame[]): MoneylineCandidate[] {
  const bucket: MoneylineCandidate[] = [];

  for (const game of games) {
    const { away, home, awayMoneyline, homeMoneyline, pickSide, moneylineStatEdge } =
      game;

    if (awayMoneyline === null || homeMoneyline === null) continue;

    const awayIsUnderdog = awayMoneyline > homeMoneyline;
    const dogTeam = awayIsUnderdog ? away : home;
    const dogOdds = awayIsUnderdog ? awayMoneyline : homeMoneyline;
    const dogSide = awayIsUnderdog ? ("away" as const) : ("home" as const);

    if (dogOdds <= 0) continue;

    const aiOnUnderdog = pickSide === dogSide;
    const edge = aiOnUnderdog ? moneylineStatEdge : 0;

    bucket.push({
      game,
      betLabel: dogTeam,
      betOdds: dogOdds,
      edge,
      score: Math.max(edge, 1) / 10,
      reason: aiOnUnderdog
        ? `AI plus-money dog: ${dogTeam} ${formatLine(dogOdds)} — ${edge}/10 edge.`
        : `Market underdog: ${dogTeam} ${formatLine(dogOdds)} — ${edge}/10 AI edge on this side.`,
    });
  }

  return bucket.sort(compareByEdgeThenGamePk);
}

function pickBestFromBucket<T extends { edge: number; game: EnrichedGame }>(
  bucket: T[]
): T | undefined {
  if (bucket.length === 0) return undefined;
  return [...bucket].sort(compareByEdgeThenGamePk)[0];
}

/**
 * Exactly 3 daily best bets — one per category, highest confidence each:
 * 1. Best O/U total
 * 2. Best plus-money ML underdog
 * 3. Best ML favorite (negative moneyline only)
 *
 * Never fills a missing category with a duplicate favorite.
 */
export function selectBestBets(
  games: EnrichedGame[],
  limit = EXPECTED_BEST_BETS_COUNT
): BestBet[] {
  const underdogBucket = collectUnderdogCandidates(games);
  const favoriteBucket = collectFavoriteCandidates(games);

  console.warn(
    `[BestBets] candidate pools — underdog: ${underdogBucket.length}, favorite: ${favoriteBucket.length}`
  );

  const picks: BestBet[] = [];

  const bestTotal = pickBestTotalBet(games);
  if (bestTotal) {
    picks.push(totalCandidateToBestBet(bestTotal, picks.length + 1));
  } else {
    console.warn(
      "[BestBets] No O/U total could be selected — slate has no games with a total line and prices."
    );
  }

  const bestUnderdog = pickBestFromBucket(underdogBucket);
  if (bestUnderdog) {
    picks.push(
      moneylineCandidateToBestBet(
        bestUnderdog,
        "underdog",
        picks.length + 1
      )
    );
  } else {
    console.warn(
      "[BestBets] No plus-money underdog candidate found for today's slate."
    );
  }

  const bestFavorite = pickBestFromBucket(favoriteBucket);
  if (bestFavorite) {
    picks.push(
      moneylineCandidateToBestBet(
        bestFavorite,
        "favorite",
        picks.length + 1
      )
    );
  } else {
    console.warn(
      "[BestBets] No negative-ML favorite candidate found for today's slate."
    );
  }

  if (picks.length !== EXPECTED_BEST_BETS_COUNT) {
    console.warn(
      `[BestBets] Expected ${EXPECTED_BEST_BETS_COUNT} picks but selected ${picks.length}.`
    );
  }

  return picks.slice(0, limit).map((pick, index) => ({
    ...pick,
    rank: index + 1,
  }));
}

export function getBestBetGamePks(bestBets: BestBet[]): Set<number> {
  return new Set(bestBets.map((b) => b.gamePk));
}
