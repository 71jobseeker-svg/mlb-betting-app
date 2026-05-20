import type { EnrichedGame } from "@/lib/games";

export type BestBet = EnrichedGame & {
  rank: number;
  pickTeam: string;
  pickOdds: number | null;
  statReason: string;
  statScore: number;
};

function impliedProbability(american: number): number {
  if (american > 0) return 100 / (american + 100);
  return Math.abs(american) / (Math.abs(american) + 100);
}

function scoreGame(game: EnrichedGame): {
  score: number;
  pickTeam: string;
  pickOdds: number | null;
  reason: string;
} {
  const { away, home, awayMoneyline, homeMoneyline } = game;

  if (awayMoneyline === null || homeMoneyline === null) {
    return {
      score: 0,
      pickTeam: home,
      pickOdds: null,
      reason: "Home-field edge in a competitive spot.",
    };
  }

  const awayImpl = impliedProbability(awayMoneyline);
  const homeImpl = impliedProbability(homeMoneyline);
  const awayIsUnderdog = awayImpl < homeImpl;
  const underdogTeam = awayIsUnderdog ? away : home;
  const favoriteTeam = awayIsUnderdog ? home : away;
  const underdogOdds = awayIsUnderdog ? awayMoneyline : homeMoneyline;
  const favoriteOdds = awayIsUnderdog ? homeMoneyline : awayMoneyline;
  const underdogImpl = Math.min(awayImpl, homeImpl);
  const favoriteImpl = Math.max(awayImpl, homeImpl);

  // Sweet spot: underdogs near +130 to +180 (~43–40% implied win rate)
  const idealUnderdogImpl = 0.41;
  const valueScore = Math.max(0, 1 - Math.abs(underdogImpl - idealUnderdogImpl) / 0.12);

  // Tighter lines = more competitive game (lower juice gap)
  const competitiveness = 1 - Math.min(0.35, favoriteImpl - underdogImpl);

  // Slight boost when AI backs the same side as our statistical lean
  const aiLower = game.recommendation.toLowerCase();
  const aiAligns =
    aiLower.includes(underdogTeam.toLowerCase()) ||
    aiLower.includes(underdogTeam.split(" ").pop()?.toLowerCase() ?? "");

  const score =
    valueScore * 0.5 + competitiveness * 0.35 + (aiAligns ? 0.15 : 0);

  const formatLine = (n: number) => (n > 0 ? `+${n}` : `${n}`);

  const reason =
    underdogOdds > 0
      ? `Underdog value on ${underdogTeam} at ${formatLine(underdogOdds)} (${Math.round(underdogImpl * 100)}% implied) in a tight market.`
      : `Chalk play on ${favoriteTeam} at ${formatLine(favoriteOdds)} (${Math.round(favoriteImpl * 100)}% implied win rate).`;

  return {
    score,
    pickTeam: underdogTeam,
    pickOdds: underdogOdds,
    reason,
  };
}

export function selectBestBets(games: EnrichedGame[], limit = 3): BestBet[] {
  const scored = games
    .map((game) => {
      const { score, pickTeam, pickOdds, reason } = scoreGame(game);
      return { game, score, pickTeam, pickOdds, reason };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map((s, i) => ({
    ...s.game,
    rank: i + 1,
    pickTeam: s.pickTeam,
    pickOdds: s.pickOdds,
    statReason: s.reason,
    statScore: s.score,
  }));
}

export function getBestBetGamePks(bestBets: BestBet[]): Set<number> {
  return new Set(bestBets.map((b) => b.gamePk));
}
