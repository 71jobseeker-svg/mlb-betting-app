import type { EnrichedGame } from "@/lib/games";
import { formatAmericanOdds } from "@/lib/odds";
import { EXPECTED_BEST_BETS_COUNT } from "@/lib/slate-picks-ready";

export type BestBetType = "moneyline" | "total";

export type BestBet = EnrichedGame & {
  rank: number;
  betType: BestBetType;
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

function impliedProbability(american: number): number {
  if (american > 0) return 100 / (american + 100);
  return Math.abs(american) / (Math.abs(american) + 100);
}

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

function underdogValueScore(pickOdds: number): number {
  const pickImpl = impliedProbability(pickOdds);
  const ideal = 0.41;
  return Math.max(0, 1 - Math.abs(pickImpl - ideal) / 0.15);
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
  const value = underdogValueScore(pickOdds);
  const score = (Math.max(edge, 1) / 10) * 0.55 + value * 0.45;

  return {
    game,
    betLabel: pickTeam,
    betOdds: pickOdds,
    edge,
    score,
    reason: `AI plus-money dog: ${pickTeam} ${formatLine(pickOdds)} — ${edge}/10 edge, ${Math.round(value * 100)}% value score.`,
  };
}

function compareUnderdogCandidates(
  a: MoneylineCandidate,
  b: MoneylineCandidate
): number {
  if (b.edge !== a.edge) return b.edge - a.edge;
  if (b.score !== a.score) return b.score - a.score;
  return b.game.gamePk - a.game.gamePk;
}

function candidateToBestBet(
  candidate: TotalCandidate | MoneylineCandidate,
  betType: BestBetType,
  rank: number
): BestBet {
  return {
    ...candidate.game,
    rank,
    betType,
    betLabel: candidate.betLabel,
    betOdds: candidate.betOdds,
    statReason: candidate.reason,
    statScore: candidate.score,
  };
}

function pickBestTotal(
  totalsStrong: TotalCandidate[],
  totalsAll: TotalCandidate[],
  excludeGamePk?: number
): TotalCandidate | undefined {
  const matches = (candidate: TotalCandidate) =>
    excludeGamePk === undefined || candidate.game.gamePk !== excludeGamePk;

  return (
    totalsStrong.find(matches) ??
    totalsAll.find(matches)
  );
}

/**
 * Daily best bets (always 3 when the slate supports it):
 * 1. Highest-edge O/U (prefer 7+ edge)
 * 2. Highest-edge ML favorite (negative moneyline only)
 * 3. Best plus-money underdog, or 2nd-best O/U when no dog exists
 */
export function selectBestBets(
  games: EnrichedGame[],
  limit = EXPECTED_BEST_BETS_COUNT
): BestBet[] {
  const totalsAll = games
    .map((game) => buildTotalCandidate(game))
    .filter((candidate): candidate is TotalCandidate => candidate !== null)
    .sort(compareByEdgeThenGamePk);

  const totalsStrong = totalsAll.filter(
    (candidate) => candidate.edge >= MIN_TOTALS_EDGE
  );

  const favorites = games
    .map((game) => buildFavoriteCandidate(game))
    .filter((candidate): candidate is MoneylineCandidate => candidate !== null)
    .sort(compareByEdgeThenGamePk);

  const underdogs = games
    .map((game) => buildUnderdogCandidate(game))
    .filter((candidate): candidate is MoneylineCandidate => candidate !== null)
    .sort(compareUnderdogCandidates);

  const picks: BestBet[] = [];

  const bestTotal = pickBestTotal(totalsStrong, totalsAll);
  if (bestTotal) {
    picks.push(candidateToBestBet(bestTotal, "total", picks.length + 1));
  }

  const bestFavorite = favorites[0];
  if (bestFavorite) {
    picks.push(candidateToBestBet(bestFavorite, "moneyline", picks.length + 1));
  }

  const bestUnderdog = underdogs[0];
  if (bestUnderdog) {
    picks.push(candidateToBestBet(bestUnderdog, "moneyline", picks.length + 1));
  } else {
    const secondTotal = pickBestTotal(
      totalsStrong,
      totalsAll,
      bestTotal?.game.gamePk
    );
    if (secondTotal) {
      picks.push(candidateToBestBet(secondTotal, "total", picks.length + 1));
    }
  }

  while (picks.length < limit) {
    const usedTotalGamePks = new Set(
      picks.filter((pick) => pick.betType === "total").map((pick) => pick.gamePk)
    );
    const usedFavoriteGamePks = new Set(
      picks
        .filter(
          (pick) =>
            pick.betType === "moneyline" && (pick.betOdds ?? 0) < 0
        )
        .map((pick) => pick.gamePk)
    );
    const usedUnderdogGamePks = new Set(
      picks
        .filter(
          (pick) =>
            pick.betType === "moneyline" && (pick.betOdds ?? 0) > 0
        )
        .map((pick) => pick.gamePk)
    );

    if (!picks.some((pick) => pick.betType === "total")) {
      const nextTotal =
        pickBestTotal(totalsStrong, totalsAll) ??
        totalsAll.find(
          (candidate) => !usedTotalGamePks.has(candidate.game.gamePk)
        );
      if (nextTotal && !usedTotalGamePks.has(nextTotal.game.gamePk)) {
        picks.push(candidateToBestBet(nextTotal, "total", picks.length + 1));
        continue;
      }
    }

    if (
      !picks.some(
        (pick) => pick.betType === "moneyline" && (pick.betOdds ?? 0) < 0
      )
    ) {
      const nextFavorite = favorites.find(
        (candidate) => !usedFavoriteGamePks.has(candidate.game.gamePk)
      );
      if (nextFavorite) {
        picks.push(candidateToBestBet(nextFavorite, "moneyline", picks.length + 1));
        continue;
      }
    }

    if (
      !picks.some(
        (pick) => pick.betType === "moneyline" && (pick.betOdds ?? 0) > 0
      )
    ) {
      const nextUnderdog = underdogs.find(
        (candidate) => !usedUnderdogGamePks.has(candidate.game.gamePk)
      );
      if (nextUnderdog) {
        picks.push(candidateToBestBet(nextUnderdog, "moneyline", picks.length + 1));
        continue;
      }

      const firstTotalGamePk = picks.find((pick) => pick.betType === "total")
        ?.gamePk;
      const nextTotal = pickBestTotal(
        totalsStrong,
        totalsAll,
        firstTotalGamePk
      );
      if (
        nextTotal &&
        !usedTotalGamePks.has(nextTotal.game.gamePk)
      ) {
        picks.push(candidateToBestBet(nextTotal, "total", picks.length + 1));
        continue;
      }
    }

    const nextFavorite = favorites.find(
      (candidate) => !usedFavoriteGamePks.has(candidate.game.gamePk)
    );
    if (nextFavorite) {
      picks.push(candidateToBestBet(nextFavorite, "moneyline", picks.length + 1));
      continue;
    }

    break;
  }

  return picks.slice(0, limit).map((pick, index) => ({
    ...pick,
    rank: index + 1,
  }));
}

export function getBestBetGamePks(bestBets: BestBet[]): Set<number> {
  return new Set(bestBets.map((b) => b.gamePk));
}
