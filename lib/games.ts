import "server-only";

import { generateBettingRecommendations } from "@/lib/analysis";
import { selectBestBets, type BestBet } from "@/lib/best-bets";
import { hydrateSlate } from "@/lib/hydrate-slate";
import type { RecordTotals } from "@/lib/persistence/types";
import { getTodayInPacific } from "@/lib/date";
import {
  extractGameDateTime,
  extractGameResult,
  extractGameScores,
  fetchMlbSchedule,
} from "@/lib/mlb";
import { parseAiPick } from "@/lib/picks";
import type { PickResult } from "@/lib/persistence/types";
import {
  extractMoneyline,
  extractTotalLine,
  fetchMlbMoneylineOdds,
  findOddsForMatchup,
} from "@/lib/odds";
import { formatStartTimeET } from "@/lib/time";

export type { PickResult };

export type EnrichedGame = {
  gamePk: number;
  away: string;
  home: string;
  status: string;
  startTime: string;
  gameDateIso: string | null;
  isFinal: boolean;
  awayWon: boolean | null;
  awayScore: number | null;
  homeScore: number | null;
  awayMoneyline: number | null;
  homeMoneyline: number | null;
  totalPoint: number | null;
  overPrice: number | null;
  underPrice: number | null;
  bookmaker: string | null;
  recommendation: string;
  totalsRecommendation: string | null;
  totalsPick: "over" | "under" | null;
  totalsStatEdge: number;
  pickTeam: string;
  pickSide: "away" | "home";
  pickOdds: number | null;
  aiResult: PickResult | null;
  bestBetResult: PickResult | null;
};

export async function getTodaysGamesWithAnalysis(): Promise<{
  date: string;
  games: EnrichedGame[];
  bestBets: BestBet[];
  totals: {
    bestBets: RecordTotals;
    aiPicks: RecordTotals;
  };
}> {
  const date = getTodayInPacific();

  let schedule;
  try {
    schedule = await fetchMlbSchedule(date);
  } catch (error) {
    console.error("MLB schedule fetch failed:", error);
    return {
      date,
      games: [],
      bestBets: [],
      totals: {
        bestBets: { wins: 0, losses: 0 },
        aiPicks: { wins: 0, losses: 0 },
      },
    };
  }

  const oddsEvents = await fetchMlbMoneylineOdds();

  const rawGames = schedule.dates?.[0]?.games ?? [];

  const gamesForAnalysis = rawGames.map((game) => {
    const away = game.teams?.away?.team?.name ?? "Away";
    const home = game.teams?.home?.team?.name ?? "Home";
    const gameDateIso = extractGameDateTime(game);
    const startTime = formatStartTimeET(gameDateIso);
    const { awayScore, homeScore } = extractGameScores(game);
    const { isFinal, awayWon } = extractGameResult(game);
    const oddsEvent = findOddsForMatchup(oddsEvents, away, home);
    const moneyline = oddsEvent
      ? extractMoneyline(oddsEvent, away, home)
      : { awayMoneyline: null, homeMoneyline: null, bookmaker: null };
    const totals = oddsEvent
      ? extractTotalLine(oddsEvent)
      : { point: null, overPrice: null, underPrice: null };

    return {
      gamePk: game.gamePk,
      away,
      home,
      status: game.status?.detailedState ?? "Unknown",
      startTime,
      gameDateIso,
      isFinal,
      awayWon,
      awayScore,
      homeScore,
      awayMoneyline: moneyline.awayMoneyline,
      homeMoneyline: moneyline.homeMoneyline,
      totalPoint: totals.point,
      overPrice: totals.overPrice,
      underPrice: totals.underPrice,
      bookmaker: moneyline.bookmaker,
    };
  });

  const recommendations = await generateBettingRecommendations(
    gamesForAnalysis.map((g) => ({
      gamePk: g.gamePk,
      away: g.away,
      home: g.home,
      status: g.status,
      startTime: g.startTime,
      awayMoneyline: g.awayMoneyline,
      homeMoneyline: g.homeMoneyline,
      totalPoint: g.totalPoint,
      overPrice: g.overPrice,
      underPrice: g.underPrice,
    }))
  );

  const games: EnrichedGame[] = gamesForAnalysis.map((game) => {
    const analysis =
      recommendations.get(game.gamePk) ??
      ({
        moneylineRecommendation: "No recommendation available.",
        totalsPick: null,
        totalsRecommendation: null,
        totalsStatEdge: 0,
      } as const);

    const pick = parseAiPick({
      away: game.away,
      home: game.home,
      awayMoneyline: game.awayMoneyline,
      homeMoneyline: game.homeMoneyline,
      recommendation: analysis.moneylineRecommendation,
    });

    return {
      gamePk: game.gamePk,
      away: game.away,
      home: game.home,
      status: game.status,
      startTime: game.startTime,
      gameDateIso: game.gameDateIso,
      isFinal: game.isFinal,
      awayWon: game.awayWon,
      awayScore: game.awayScore,
      homeScore: game.homeScore,
      awayMoneyline: game.awayMoneyline,
      homeMoneyline: game.homeMoneyline,
      totalPoint: game.totalPoint,
      overPrice: game.overPrice,
      underPrice: game.underPrice,
      bookmaker: game.bookmaker,
      recommendation: analysis.moneylineRecommendation,
      totalsRecommendation: analysis.totalsRecommendation,
      totalsPick: analysis.totalsPick,
      totalsStatEdge: analysis.totalsStatEdge,
      pickTeam: pick.pickTeam,
      pickSide: pick.pickSide,
      pickOdds: pick.pickOdds,
      aiResult: null,
      bestBetResult: null,
    };
  });

  const suggestedBestBets = selectBestBets(games);
  const hydrated = await hydrateSlate(date, games, suggestedBestBets);

  return {
    date,
    games: hydrated.games,
    bestBets: hydrated.bestBets,
    totals: hydrated.totals,
  };
}
