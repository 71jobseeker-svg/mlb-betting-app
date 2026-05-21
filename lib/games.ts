import "server-only";

import { generateBettingRecommendations } from "@/lib/analysis";
import { selectBestBets, getBestBetGamePks } from "@/lib/best-bets";
import {
  extractGameResult,
  extractGameScores,
  fetchMlbSchedule,
  fetchMlbScheduleRange,
} from "@/lib/mlb";
import { parseAiPick } from "@/lib/picks";
import {
  getResultForGame,
  loadRecords,
  settleRecentFinalGames,
  syncRecords,
  type BettingRecords,
  type PickResult,
  type RecordTotals,
} from "@/lib/records";
import {
  extractMoneyline,
  extractTotalLine,
  fetchMlbMoneylineOdds,
  findOddsForMatchup,
} from "@/lib/odds";

export type EnrichedGame = {
  gamePk: number;
  away: string;
  home: string;
  status: string;
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
  pickTeam: string;
  pickSide: "away" | "home";
  pickOdds: number | null;
  aiResult: PickResult | null;
  bestBetResult: PickResult | null;
};

function dateDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

async function settlePendingFromRecentDays(
  bestBetGamePks: Set<number>,
  today: string
): Promise<void> {
  try {
    const records = loadRecords();
    const pendingKeys = Object.keys(records.pending);
    if (pendingKeys.length === 0) return;

    const startDate = dateDaysAgo(7);
    const dateSlates = await fetchMlbScheduleRange(startDate, today);

    const toSettle = [];

    for (const day of dateSlates) {
      for (const game of day.games ?? []) {
        const key = String(game.gamePk);
        if (!records.pending[key] && !records.settled[key]) continue;

        const { isFinal, awayWon } = extractGameResult(game);
        if (!isFinal || awayWon === null) continue;

        const { awayScore, homeScore } = extractGameScores(game);
        const pending = records.pending[key];

        toSettle.push({
          gamePk: game.gamePk,
          date: day.date,
          away: game.teams?.away?.team?.name ?? "Away",
          home: game.teams?.home?.team?.name ?? "Home",
          awayScore: awayScore ?? 0,
          homeScore: homeScore ?? 0,
          isFinal: true,
          awayWon,
          pickTeam: pending?.pickTeam ?? "",
          pickSide: pending?.pickSide ?? "home",
          wasBestBet: pending?.wasBestBet ?? bestBetGamePks.has(game.gamePk),
        });
      }
    }

    if (toSettle.length > 0) settleRecentFinalGames(toSettle);
  } catch (error) {
    console.error("Failed to settle pending records:", error);
  }
}

export async function getTodaysGamesWithAnalysis(): Promise<{
  date: string;
  games: EnrichedGame[];
  records: BettingRecords;
  totals: {
    bestBets: RecordTotals;
    aiPicks: RecordTotals;
  };
}> {
  const date = new Date().toISOString().slice(0, 10);

  let schedule;
  try {
    schedule = await fetchMlbSchedule(date);
  } catch (error) {
    console.error("MLB schedule fetch failed:", error);
    return {
      date,
      games: [],
      records: loadRecords(),
      totals: loadRecords().totals,
    };
  }

  const oddsEvents = await fetchMlbMoneylineOdds();

  const rawGames = schedule.dates?.[0]?.games ?? [];

  const gamesForAnalysis = rawGames.map((game) => {
    const away = game.teams?.away?.team?.name ?? "Away";
    const home = game.teams?.home?.team?.name ?? "Home";
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
      awayMoneyline: g.awayMoneyline,
      homeMoneyline: g.homeMoneyline,
    }))
  );

  let games: EnrichedGame[] = gamesForAnalysis.map((game) => {
    const recommendation =
      recommendations.get(game.gamePk) ?? "No recommendation available.";
    const pick = parseAiPick({ ...game, recommendation });

    return {
      gamePk: game.gamePk,
      away: game.away,
      home: game.home,
      status: game.status,
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
      recommendation,
      pickTeam: pick.pickTeam,
      pickSide: pick.pickSide,
      pickOdds: pick.pickOdds,
      aiResult: null,
      bestBetResult: null,
    };
  });

  const bestBets = selectBestBets(games);
  const bestBetGamePks = getBestBetGamePks(bestBets);

  await settlePendingFromRecentDays(bestBetGamePks, date);

  const records = syncRecords(games, bestBetGamePks, date);

  games = games.map((game) => {
    const { aiResult, bestBetResult } = getResultForGame(records, game.gamePk);
    return { ...game, aiResult, bestBetResult };
  });

  return {
    date,
    games,
    records,
    totals: records.totals,
  };
}
