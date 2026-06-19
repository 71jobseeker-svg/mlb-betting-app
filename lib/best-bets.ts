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

const MIN_TOTALS_EDGE = 7;

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

function buildTotalCandidate(game: EnrichedGame): TotalCandidate | null {
  if (!game.totalsPick || game.totalPoint === null) return null;

  const betOdds =
    game.totalsPick === "over" ? game.overPrice : game.underPrice;
  if (betOdds === null) return null;

  const betLabel = `${game.totalsPick === "over" ? "Over" : "Under"} ${game.totalPoint}`;
  const edge = game.totalsStatEdge;

  return {
    game,
    betLabel,
    betOdds,
    edge,
    score: Math.max(edge, 1) / 10,
    reason:
      game.totalsRecommendation ??
      `AI sees ${edge}/10 statistical edge on the ${betLabel} (${formatAmericanOdds(betOdds)}).`,
  };
}

function buildFavoriteCandidate(game: EnrichedGame): MoneylineCandidate | null {
  const { pickTeam, pickOdds, awayMoneyline, homeMoneyline, moneylineStatEdge } =
    game;

  if (
    pickOdds === null ||
    pickOdds >= 0 ||
    awayMoneyline === null ||
    homeMoneyline === null ||
    !game.picksAvailable
  ) {
    return null;
  }

  const edge = moneylineStatEdge;

  return {
    game,
    betLabel: pickTeam,
    betOdds: pickOdds,
    edge,
    score: Math.max(edge, 1) / 10,
    reason: `AI ML favorite: ${pickTeam} ${formatLine(pickOdds)} — ${edge}/10 edge.`,
  };
}

function buildUnderdogCandidate(game: EnrichedGame): MoneylineCandidate | null {
  const { pickTeam, pickOdds, awayMoneyline, homeMoneyline, moneylineStatEdge } =
    game;

  if (
    pickOdds === null ||
    pickOdds <= 0 ||
    awayMoneyline === null ||
    homeMoneyline === null ||
    !game.picksAvailable
  ) {
    return null;
  }

  const edge = moneylineStatEdge;

  return {
    game,
    betLabel: pickTeam,
    betOdds: pickOdds,
    edge,
    score: Math.max(edge, 1) / 10,
    reason: `AI plus-money dog: ${pickTeam} ${formatLine(pickOdds)} — ${edge}/10 edge.`,
  };
}

function candidateToBestBet(
  candidate: TotalCandidate | MoneylineCandidate,
  betType: BestBetType,
  betCategory: BestBetCategory,
  rank: number
): BestBet {
  return {
    ...candidate.game,
    rank,
    betType,
    betCategory,
    betLabel: candidate.betLabel,
    betOdds: candidate.betOdds,
    statReason: candidate.reason,
    statScore: candidate.score,
  };
}

function pickHighestConfidenceTotal(
  candidates: TotalCandidate[]
): TotalCandidate | undefined {
  const strong = candidates.filter((c) => c.edge >= MIN_TOTALS_EDGE);
  const pool = strong.length > 0 ? strong : candidates;
  return pool.sort(compareByEdgeThenGamePk)[0];
}

/**
 * Exactly 3 daily best bets — one per category, highest confidence each:
 * 1. Best O/U total
 * 2. Best plus-money ML underdog
 * 3. Best ML favorite (negative moneyline only)
 */
export function selectBestBets(
  games: EnrichedGame[],
  limit = EXPECTED_BEST_BETS_COUNT
): BestBet[] {
  const totals = games
    .map((game) => buildTotalCandidate(game))
    .filter((candidate): candidate is TotalCandidate => candidate !== null);

  const favorites = games
    .map((game) => buildFavoriteCandidate(game))
    .filter((candidate): candidate is MoneylineCandidate => candidate !== null)
    .sort(compareByEdgeThenGamePk);

  const underdogs = games
    .map((game) => buildUnderdogCandidate(game))
    .filter((candidate): candidate is MoneylineCandidate => candidate !== null)
    .sort(compareByEdgeThenGamePk);

  const picks: BestBet[] = [];

  const bestTotal = pickHighestConfidenceTotal(totals);
  if (bestTotal) {
    picks.push(
      candidateToBestBet(bestTotal, "total", "total", picks.length + 1)
    );
  }

  const bestUnderdog = underdogs[0];
  if (bestUnderdog) {
    picks.push(
      candidateToBestBet(bestUnderdog, "moneyline", "underdog", picks.length + 1)
    );
  }

  const bestFavorite = favorites[0];
  if (bestFavorite) {
    picks.push(
      candidateToBestBet(bestFavorite, "moneyline", "favorite", picks.length + 1)
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
