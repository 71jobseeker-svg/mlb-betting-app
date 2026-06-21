import type { EnrichedGame } from "@/lib/games";
import { formatAmericanOdds } from "@/lib/odds";
import { EXPECTED_BEST_BETS_COUNT } from "@/lib/slate-picks-ready";

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

type TotalCandidate = {
  game: EnrichedGame;
  betLabel: string;
  betOdds: number;
  edge: number;
  reason: string;
  score: number;
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

function candidateToBestBet(
  candidate: TotalCandidate | MoneylineCandidate,
  betType: BestBetType,
  betCategory: BestBetCategory,
  rank: number
): BestBet {
  const base: BestBet = {
    ...candidate.game,
    rank,
    betType,
    betCategory,
    betLabel: candidate.betLabel,
    betOdds: candidate.betOdds,
    statReason: candidate.reason,
    statScore: candidate.score,
  };

  if (betType === "moneyline") {
    const side =
      candidate.betLabel === candidate.game.away
        ? ("away" as const)
        : ("home" as const);
    return {
      ...base,
      pickTeam: candidate.betLabel,
      pickSide: side,
      pickOdds: candidate.betOdds,
    };
  }

  return base;
}

/** O/U bucket: any game with a totals pick, line, and price. */
function collectTotalCandidates(games: EnrichedGame[]): TotalCandidate[] {
  const bucket: TotalCandidate[] = [];

  for (const game of games) {
    if (!game.totalsPick || game.totalPoint === null) continue;

    const betOdds =
      game.totalsPick === "over" ? game.overPrice : game.underPrice;
    if (betOdds === null) continue;

    const betLabel = `${game.totalsPick === "over" ? "Over" : "Under"} ${game.totalPoint}`;
    const edge = game.totalsStatEdge;

    bucket.push({
      game,
      betLabel,
      betOdds,
      edge,
      score: Math.max(edge, 1) / 10,
      reason:
        game.totalsRecommendation ??
        `AI sees ${edge}/10 statistical edge on the ${betLabel} (${formatAmericanOdds(betOdds)}).`,
    });
  }

  return bucket.sort(compareByEdgeThenGamePk);
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
  const totalBucket = collectTotalCandidates(games);
  const underdogBucket = collectUnderdogCandidates(games);
  const favoriteBucket = collectFavoriteCandidates(games);

  console.warn(
    `[BestBets] candidate pools — total: ${totalBucket.length}, underdog: ${underdogBucket.length}, favorite: ${favoriteBucket.length}`
  );

  const picks: BestBet[] = [];

  const bestTotal = pickBestFromBucket(totalBucket);
  if (bestTotal) {
    picks.push(
      candidateToBestBet(bestTotal, "total", "total", picks.length + 1)
    );
  } else {
    console.warn(
      "[BestBets] No O/U total candidate found for today's slate (need totalsPick + line + price)."
    );
  }

  const bestUnderdog = pickBestFromBucket(underdogBucket);
  if (bestUnderdog) {
    picks.push(
      candidateToBestBet(
        bestUnderdog,
        "moneyline",
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
      candidateToBestBet(
        bestFavorite,
        "moneyline",
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
      `[BestBets] Expected ${EXPECTED_BEST_BETS_COUNT} picks but selected ${picks.length}. Missing categories are not backfilled.`
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
