import { NextResponse } from "next/server";
import { formatPacificTime, getTodayInPacific, isAfter8amPacific } from "@/lib/date";
import { getTodaysGamesWithAnalysis } from "@/lib/games";
import { isRecordsPaused } from "@/lib/persistence/reset";
import { loadMeta } from "@/lib/persistence/store";
import {
  canGenerateAndLockPicks,
  countOddsCoverage,
  hasFullSlateMoneylineOdds,
} from "@/lib/slate-picks-ready";

export const dynamic = "force-dynamic";

/** GET /api/slate-debug — why picks did or did not post (check Vercel logs for full trace). */
export async function GET() {
  try {
    const date = getTodayInPacific();
    const meta = await loadMeta();
    const result = await getTodaysGamesWithAnalysis();

    const shells = result.games.map((g) => ({
      gamePk: g.gamePk,
      away: g.away,
      home: g.home,
      status: g.status,
      isFinal: g.isFinal,
      awayMoneyline: g.awayMoneyline,
      homeMoneyline: g.homeMoneyline,
      picksAvailable: g.picksAvailable,
    }));

    return NextResponse.json({
      nowPT: formatPacificTime(),
      slateDate: date,
      isAfter8amPT: isAfter8amPacific(),
      recordsPaused: isRecordsPaused(date, meta),
      meta,
      oddsCoverage: countOddsCoverage(shells),
      hasFullSlateMoneylineOdds: hasFullSlateMoneylineOdds(shells),
      canGenerateAndLockPicks: canGenerateAndLockPicks(shells),
      picksStatus: result.picksStatus,
      picksMessage: result.picksMessage,
      lockedBestBets: result.bestBets.length,
      bestBetTypes: result.bestBets.map((bet) => ({
        rank: bet.rank,
        betType: bet.betType,
        betLabel: bet.betLabel,
        gamePk: bet.gamePk,
      })),
      lockedGamePicks: result.games.filter((g) => g.picksAvailable).length,
      totals: result.totals,
    });
  } catch (error) {
    console.error("[DiamondEdge] slate-debug error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
