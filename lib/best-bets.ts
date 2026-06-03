import type { EnrichedGame } from "@/lib/games";
import { formatAmericanOdds } from "@/lib/odds";

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

function impliedProbability(american: number): number {
  if (american > 0) return 100 / (american + 100);
  return Math.abs(american) / (Math.abs(american) + 100);
}

function formatLine(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

function scoreMoneylineBet(game: EnrichedGame): {
  score: number;
  reason: string;
  betLabel: string;
  betOdds: number | null;
} | null {
  const { pickTeam, pickOdds, awayMoneyline, homeMoneyline, moneylineStatEdge } =
    game;

  if (
    pickOdds === null ||
    awayMoneyline === null ||
    homeMoneyline === null
  ) {
    return null;
  }

  const pickImpl = impliedProbability(pickOdds);
  const awayImpl = impliedProbability(awayMoneyline);
  const homeImpl = impliedProbability(homeMoneyline);
  const competitiveness = 1 - Math.min(0.35, Math.abs(awayImpl - homeImpl));

  let valueScore: number;
  if (pickOdds > 0) {
    const ideal = 0.41;
    valueScore = Math.max(0, 1 - Math.abs(pickImpl - ideal) / 0.15);
  } else {
    valueScore = pickImpl >= 0.55 ? 0.75 : 0.45;
  }

  const edgeNorm = moneylineStatEdge / 10;
  const score =
    edgeNorm * 0.5 + pickImpl * 0.3 + valueScore * 0.1 + competitiveness * 0.1;

  return {
    score,
    reason: `AI ML: ${pickTeam} ${formatLine(pickOdds)} — ${moneylineStatEdge}/10 edge, ${Math.round(pickImpl * 100)}% implied win prob.`,
    betLabel: pickTeam,
    betOdds: pickOdds,
  };
}

function scoreTotalsBet(game: EnrichedGame): {
  score: number;
  reason: string;
  betLabel: string;
  betOdds: number | null;
} | null {
  if (
    !game.totalsPick ||
    game.totalsStatEdge < MIN_TOTALS_EDGE ||
    game.totalPoint === null
  ) {
    return null;
  }

  const odds =
    game.totalsPick === "over" ? game.overPrice : game.underPrice;
  if (odds === null) return null;

  const betLabel = `${game.totalsPick === "over" ? "Over" : "Under"} ${game.totalPoint}`;
  const edgeNorm = game.totalsStatEdge / 10;

  const impl = impliedProbability(odds);
  const juiceScore = Math.max(0.4, 1 - Math.abs(impl - 0.52) / 0.12);

  const score = edgeNorm * 0.75 + juiceScore * 0.25;

  return {
    score,
    reason:
      game.totalsRecommendation ??
      `AI sees ${game.totalsStatEdge}/10 statistical edge on the ${betLabel} (${formatAmericanOdds(odds)}).`,
    betLabel,
    betOdds: odds,
  };
}

type Candidate = {
  game: EnrichedGame;
  betType: BestBetType;
  score: number;
  reason: string;
  betLabel: string;
  betOdds: number | null;
  edge: number;
};

function candidateEdge(game: EnrichedGame, betType: BestBetType): number {
  return betType === "total" ? game.totalsStatEdge : game.moneylineStatEdge;
}

function compareCandidates(a: Candidate, b: Candidate): number {
  if (b.score !== a.score) return b.score - a.score;
  if (b.edge !== a.edge) return b.edge - a.edge;
  return b.game.gamePk - a.game.gamePk;
}

/** Top plays by statistical edge / confidence — never schedule order. */
export function selectBestBets(games: EnrichedGame[], limit = 3): BestBet[] {
  const candidates: Candidate[] = [];

  for (const game of games) {
    const ml = scoreMoneylineBet(game);
    if (ml) {
      candidates.push({
        game,
        betType: "moneyline",
        score: ml.score,
        reason: ml.reason,
        betLabel: ml.betLabel,
        betOdds: ml.betOdds,
        edge: game.moneylineStatEdge,
      });
    }

    const totals = scoreTotalsBet(game);
    if (totals) {
      candidates.push({
        game,
        betType: "total",
        score: totals.score,
        reason: totals.reason,
        betLabel: totals.betLabel,
        betOdds: totals.betOdds,
        edge: game.totalsStatEdge,
      });
    }
  }

  const top = [...candidates].sort(compareCandidates).slice(0, limit);

  return top.map((c, i) => ({
    ...c.game,
    rank: i + 1,
    betType: c.betType,
    betLabel: c.betLabel,
    betOdds: c.betOdds,
    statReason: c.reason,
    statScore: c.score,
  }));
}

export function getBestBetGamePks(bestBets: BestBet[]): Set<number> {
  return new Set(bestBets.map((b) => b.gamePk));
}
