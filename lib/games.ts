import { generateBettingRecommendations } from "@/lib/analysis";
import { fetchMlbSchedule } from "@/lib/mlb";
import {
  extractMoneyline,
  fetchMlbMoneylineOdds,
  findOddsForMatchup,
} from "@/lib/odds";

export type EnrichedGame = {
  gamePk: number;
  away: string;
  home: string;
  status: string;
  awayMoneyline: number | null;
  homeMoneyline: number | null;
  bookmaker: string | null;
  recommendation: string;
};

export async function getTodaysGamesWithAnalysis(): Promise<{
  date: string;
  games: EnrichedGame[];
}> {
  const date = new Date().toISOString().slice(0, 10);

  const [schedule, oddsEvents] = await Promise.all([
    fetchMlbSchedule(date),
    fetchMlbMoneylineOdds(),
  ]);

  const rawGames = schedule.dates?.[0]?.games ?? [];

  const gamesForAnalysis = rawGames.map((game) => {
    const away = game.teams?.away?.team?.name ?? "Away";
    const home = game.teams?.home?.team?.name ?? "Home";
    const oddsEvent = findOddsForMatchup(oddsEvents, away, home);
    const moneyline = oddsEvent
      ? extractMoneyline(oddsEvent, away, home)
      : { awayMoneyline: null, homeMoneyline: null, bookmaker: null };

    return {
      gamePk: game.gamePk,
      away,
      home,
      status: game.status?.detailedState ?? "Unknown",
      awayMoneyline: moneyline.awayMoneyline,
      homeMoneyline: moneyline.homeMoneyline,
      bookmaker: moneyline.bookmaker,
    };
  });

  const recommendations = await generateBettingRecommendations(
    gamesForAnalysis.map((g) => ({
      gamePk: g.gamePk,
      away: g.away,
      home: g.home,
      status: g.status,
      awayMoneyline: g.awayMoneyline,
      homeMoneyline: g.homeMoneyline,
    }))
  );

  const games: EnrichedGame[] = gamesForAnalysis.map((game) => ({
    ...game,
    recommendation:
      recommendations.get(game.gamePk) ?? "No recommendation available.",
  }));

  return { date, games };
}
