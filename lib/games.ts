import "server-only";

import { generateBettingRecommendations } from "@/lib/analysis";
import { selectBestBets, type BestBet } from "@/lib/best-bets";
import { hydrateSlate } from "@/lib/hydrate-slate";
import { applyLockedBestBets, applyLockedPicks } from "@/lib/lock-picks";
import type { RecordTotals } from "@/lib/persistence/types";
import { getTodayInPacific } from "@/lib/date";
import {
  extractGameDateTime,
  extractGameResult,
  extractGameScores,
  extractLiveInning,
  fetchMlbSchedule,
} from "@/lib/mlb";
import { parseAiPick } from "@/lib/picks";
import type { PickResult } from "@/lib/persistence/types";
import {
  extractMoneyline,
  extractTotalLine,
  fetchMlbMoneylineOdds,
  findOddsForMatchup,
  type OddsApiEvent,
} from "@/lib/odds";
import { clearRecordsPauseAfter8am } from "@/lib/persistence/reset";
import { logSlateGateDiagnostics, logSlatePipeline } from "@/lib/slate-diagnostics";
import {
  canGenerateAndLockPicks,
  gameHasMoneylineOdds,
  isPickableGame,
  resolveBestBetsStatus,
  resolveSlatePicksStatus,
  slatePicksPendingMessage,
  type SlatePicksStatus,
} from "@/lib/slate-picks-ready";
import { formatStartTimeET } from "@/lib/time";

export type { PickResult };

export type EnrichedGame = {
  gamePk: number;
  away: string;
  home: string;
  status: string;
  liveInning: string | null;
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
  picksAvailable: boolean;
  recommendation: string;
  totalsRecommendation: string | null;
  totalsPick: "over" | "under" | null;
  totalsStatEdge: number;
  moneylineStatEdge: number;
  pickTeam: string;
  pickSide: "away" | "home";
  pickOdds: number | null;
  aiResult: PickResult | null;
  bestBetResult: PickResult | null;
};

type GameShell = Omit<
  EnrichedGame,
  | "picksAvailable"
  | "recommendation"
  | "totalsRecommendation"
  | "totalsPick"
  | "totalsStatEdge"
  | "moneylineStatEdge"
  | "pickTeam"
  | "pickSide"
  | "pickOdds"
  | "aiResult"
  | "bestBetResult"
>;

function buildPendingGame(
  shell: GameShell,
  pendingMessage: string
): EnrichedGame {
  return {
    ...shell,
    picksAvailable: false,
    recommendation: pendingMessage,
    totalsRecommendation: null,
    totalsPick: null,
    totalsStatEdge: 0,
    moneylineStatEdge: 0,
    pickTeam: shell.away,
    pickSide: "away",
    pickOdds: null,
    aiResult: null,
    bestBetResult: null,
  };
}

export async function getTodaysGamesWithAnalysis(): Promise<{
  date: string;
  games: EnrichedGame[];
  bestBets: BestBet[];
  picksStatus: SlatePicksStatus;
  picksMessage: string | null;
  totals: {
    bestBets: RecordTotals;
    aiPicks: RecordTotals;
  };
}> {
  const date = getTodayInPacific();
  const emptyTotals = {
    bestBets: { wins: 0, losses: 0 },
    aiPicks: { wins: 0, losses: 0 },
  };

  logSlatePipeline("start", { slateDate: date });

  let schedule;
  try {
    schedule = await fetchMlbSchedule(date);
    logSlatePipeline("mlb-schedule-ok", {
      games: schedule.dates?.[0]?.games?.length ?? 0,
    });
  } catch (error) {
    console.error("[DiamondEdge] MLB schedule fetch failed:", error);
    return {
      date,
      games: [],
      bestBets: [],
      picksStatus: { type: "pending", reason: "awaiting-odds" },
      picksMessage: "Could not load today's MLB schedule.",
      totals: emptyTotals,
    };
  }

  let oddsEvents: OddsApiEvent[] = [];
  try {
    oddsEvents = await fetchMlbMoneylineOdds();
    logSlatePipeline("odds-api-ok", { events: oddsEvents.length });
  } catch (error) {
    console.error("[DiamondEdge] Odds API fetch failed:", error);
    oddsEvents = [];
  }

  const rawGames = schedule.dates?.[0]?.games ?? [];

  const shells: GameShell[] = rawGames.map((game) => {
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
      liveInning: extractLiveInning(game),
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

  await logSlateGateDiagnostics(date, shells);

  const picksReady = canGenerateAndLockPicks(shells);
  const picksMessage = slatePicksPendingMessage(
    resolveSlatePicksStatus(shells, false),
    shells
  );

  logSlatePipeline("picks-gate", { picksReady, picksMessage });

  let freshGames: EnrichedGame[];

  if (!picksReady) {
    freshGames = shells.map((shell) =>
      buildPendingGame(shell, picksMessage ?? "Picks not yet available.")
    );
  } else {
    try {
      const shellsForAnalysis = shells.filter(
        (g) => isPickableGame(g) && gameHasMoneylineOdds(g)
      );
      logSlatePipeline("anthropic-start", {
        games: shellsForAnalysis.length,
        skippedNoOdds: shells.length - shellsForAnalysis.length,
      });
      const recommendations = await generateBettingRecommendations(
        shellsForAnalysis.map((g) => ({
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
      logSlatePipeline("anthropic-ok", { count: recommendations.size });

      freshGames = shells.map((shell) => {
        if (!isPickableGame(shell)) {
          return {
            ...shell,
            picksAvailable: false,
            recommendation: shell.status,
            totalsRecommendation: null,
            totalsPick: null,
            totalsStatEdge: 0,
            moneylineStatEdge: 0,
            pickTeam: shell.away,
            pickSide: "away" as const,
            pickOdds: null,
            aiResult: null,
            bestBetResult: null,
          };
        }

        if (!gameHasMoneylineOdds(shell)) {
          return buildPendingGame(
            shell,
            "Moneyline odds not available for this matchup yet."
          );
        }

        const analysis =
          recommendations.get(shell.gamePk) ??
          ({
            moneylineRecommendation: "No recommendation available.",
            moneylineStatEdge: 0,
            totalsPick: null,
            totalsRecommendation: null,
            totalsStatEdge: 0,
          } as const);

        const pick = parseAiPick({
          away: shell.away,
          home: shell.home,
          awayMoneyline: shell.awayMoneyline,
          homeMoneyline: shell.homeMoneyline,
          recommendation: analysis.moneylineRecommendation,
        });

        return {
          ...shell,
          picksAvailable:
            gameHasMoneylineOdds(shell) && pick.pickOdds !== null,
          recommendation: analysis.moneylineRecommendation,
          totalsRecommendation: analysis.totalsRecommendation,
          totalsPick: analysis.totalsPick,
          totalsStatEdge: analysis.totalsStatEdge,
          moneylineStatEdge: analysis.moneylineStatEdge,
          pickTeam: pick.pickTeam,
          pickSide: pick.pickSide,
          pickOdds: pick.pickOdds,
          aiResult: null,
          bestBetResult: null,
        };
      });
    } catch (error) {
      console.error("[DiamondEdge] Anthropic analysis failed:", error);
      freshGames = shells.map((shell) =>
        buildPendingGame(
          shell,
          "AI analysis failed. Refresh in a minute or check server logs."
        )
      );
    }
  }

  const games = await applyLockedPicks(date, freshGames, picksReady);
  const lockedPickCount = games.filter((g) => g.picksAvailable).length;
  logSlatePipeline("picks-locked", { lockedPickCount, total: games.length });

  const suggestedBestBets = picksReady ? selectBestBets(games) : [];
  const lockedBestBets = await applyLockedBestBets(
    date,
    suggestedBestBets,
    games
  );
  logSlatePipeline("best-bets-locked", { count: lockedBestBets.length });

  if (picksReady && lockedPickCount > 0) {
    await clearRecordsPauseAfter8am();
  }

  const resolvedPicksStatus = resolveBestBetsStatus(games, lockedBestBets);
  const resolvedMessage = slatePicksPendingMessage(resolvedPicksStatus, games);

  const hydrated = await hydrateSlate(date, games, lockedBestBets);

  logSlatePipeline("done", {
    picksStatus: resolvedPicksStatus,
    bestBets: hydrated.bestBets.length,
    totals: hydrated.totals,
  });

  return {
    date,
    games: hydrated.games,
    bestBets: hydrated.bestBets,
    picksStatus: resolvedPicksStatus,
    picksMessage: resolvedMessage,
    totals: hydrated.totals,
  };
}
