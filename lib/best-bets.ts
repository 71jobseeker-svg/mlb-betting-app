import type { EnrichedGame } from "@/lib/games";

export type BestBet = EnrichedGame & {
  rank: number;
  statReason: string;
  statScore: number;
};

function impliedProbability(american: number): number {
  if (american > 0) return 100 / (american + 100);
  return Math.abs(american) / (Math.abs(american) + 100);
}

function formatLine(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

/** Rank games by statistical strength of the AI's pick (same side as the card). */
function scoreAiPick(game: EnrichedGame): { score: number; reason: string } {
  const { pickTeam, pickOdds, awayMoneyline, homeMoneyline } = game;

  if (pickOdds === null || awayMoneyline === null || homeMoneyline === null) {
    return {
      score: 0.2,
      reason: `Top play: ${pickTeam} per AI analysis.`,
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
  const reason = `AI backs ${pickTeam} ML ${formatLine(pickOdds)} (${Math.round(pickImpl * 100)}% implied) — strong statistical profile.`;

  return { score, reason };
}

export function selectBestBets(games: EnrichedGame[], limit = 3): BestBet[] {
  const scored = games
    .map((game) => {
      const { score, reason } = scoreAiPick(game);
      return { game, score, reason };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map((s, i) => ({
    ...s.game,
    rank: i + 1,
    statReason: s.reason,
    statScore: s.score,
  }));
}

export function getBestBetGamePks(bestBets: BestBet[]): Set<number> {
  return new Set(bestBets.map((b) => b.gamePk));
}
