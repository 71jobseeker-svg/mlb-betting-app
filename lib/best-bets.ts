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
  bestBetResult?: "win" | "loss" | null;
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
} {
  const { pickTeam, pickOdds, awayMoneyline, homeMoneyline } = game;

  if (pickOdds === null || awayMoneyline === null || homeMoneyline === null) {
    return {
      score: 0.2,
      reason: `AI backs ${pickTeam} on the moneyline.`,
      betLabel: pickTeam,
      betOdds: pickOdds,
    };
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

  const score = valueScore * 0.55 + competitiveness * 0.45;

  return {
    score,
    reason: `AI ML: ${pickTeam} ${formatLine(pickOdds)} (${Math.round(pickImpl * 100)}% implied) — top statistical profile.`,
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
  const betLabel = `${game.totalsPick === "over" ? "Over" : "Under"} ${game.totalPoint}`;
  const edgeNorm = game.totalsStatEdge / 10;

  let juiceScore = 0.5;
  if (odds !== null) {
    const impl = impliedProbability(odds);
    juiceScore = Math.max(0.4, 1 - Math.abs(impl - 0.52) / 0.12);
  }

  const score = edgeNorm * 0.7 + juiceScore * 0.3;

  return {
    score,
    reason:
      game.totalsRecommendation ??
      `AI sees ${game.totalsStatEdge}/10 statistical edge on the ${betLabel} (${formatAmericanOdds(odds)}).`,
    betLabel,
    betOdds: odds,
  };
}

export function selectBestBets(games: EnrichedGame[], limit = 3): BestBet[] {
  const candidates: Array<{
    game: EnrichedGame;
    betType: BestBetType;
    score: number;
    reason: string;
    betLabel: string;
    betOdds: number | null;
  }> = [];

  for (const game of games) {
    const ml = scoreMoneylineBet(game);
    candidates.push({
      game,
      betType: "moneyline",
      score: ml.score,
      reason: ml.reason,
      betLabel: ml.betLabel,
      betOdds: ml.betOdds,
    });

    const totals = scoreTotalsBet(game);
    if (totals) {
      candidates.push({
        game,
        betType: "total",
        score: totals.score,
        reason: totals.reason,
        betLabel: totals.betLabel,
        betOdds: totals.betOdds,
      });
    }
  }

  const top = candidates.sort((a, b) => b.score - a.score).slice(0, limit);

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
