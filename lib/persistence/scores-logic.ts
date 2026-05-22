import type { ScoresStore, SavedScore } from "@/lib/persistence/types";
import { scoreKey } from "@/lib/persistence/keys";

export function emptyScoresStore(): ScoresStore {
  return {};
}

type GameWithScores = {
  gamePk: number;
  isFinal: boolean;
  awayScore: number | null;
  homeScore: number | null;
};

export function mergeScoresIntoGames<T extends GameWithScores>(
  games: T[],
  slateDate: string,
  scores: ScoresStore
): T[] {
  return games.map((game) => {
    const saved = scores[scoreKey(slateDate, game.gamePk)];
    if (!saved) return game;

    return {
      ...game,
      awayScore: saved.awayScore,
      homeScore: saved.homeScore,
      isFinal: saved.isFinal || game.isFinal,
    };
  });
}

export function persistFinalScores(
  games: GameWithScores[],
  slateDate: string,
  scores: ScoresStore
): ScoresStore {
  const next = { ...scores };

  for (const game of games) {
    if (
      !game.isFinal ||
      game.awayScore === null ||
      game.homeScore === null
    ) {
      continue;
    }

    const key = scoreKey(slateDate, game.gamePk);
    next[key] = {
      date: slateDate,
      gamePk: game.gamePk,
      awayScore: game.awayScore,
      homeScore: game.homeScore,
      isFinal: true,
    };
  }

  return next;
}
