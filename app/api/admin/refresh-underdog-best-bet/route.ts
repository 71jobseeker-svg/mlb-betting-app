import { NextResponse } from "next/server";
import { getLastTotalsEdgeTrace, getLastTotalsEdgeTraceMeta } from "@/lib/analysis";
import { getTodayInPacific } from "@/lib/date";
import { getTodaysGamesForBestBetRefresh } from "@/lib/games";
import { refreshLockedUnderdogBestBet } from "@/lib/lock-picks";
import { bestBetsKey } from "@/lib/persistence/keys";
import { loadLockedBestBets } from "@/lib/persistence/store";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/admin/refresh-underdog-best-bet
 * Re-locks only today's plus-money underdog best bet; O/U and favorite unchanged.
 */
export async function POST() {
  try {
    const slateDate = getTodayInPacific();
    const before = await loadLockedBestBets(slateDate);
    const oldUnderdog = before?.find((b) => b.betCategory === "underdog");

    const { games } = await getTodaysGamesForBestBetRefresh();
    const refreshed = await refreshLockedUnderdogBestBet(slateDate, games);

    if (!refreshed) {
      return NextResponse.json(
        {
          error: "Could not refresh underdog best bet",
          slateDate,
          redisKey: bestBetsKey(slateDate),
        },
        { status: 400 }
      );
    }

    const newUnderdog = refreshed.find((b) => b.betCategory === "underdog");

    return NextResponse.json({
      ok: true,
      slateDate,
      redisKey: bestBetsKey(slateDate),
      previousUnderdog: oldUnderdog
        ? {
            betLabel: oldUnderdog.betLabel,
            gamePk: oldUnderdog.gamePk,
            betOdds: oldUnderdog.betOdds,
            moneylineStatEdge: oldUnderdog.moneylineStatEdge,
            statScore: oldUnderdog.statScore,
          }
        : null,
      newUnderdog: newUnderdog
        ? {
            betLabel: newUnderdog.betLabel,
            gamePk: newUnderdog.gamePk,
            betOdds: newUnderdog.betOdds,
            moneylineStatEdge: newUnderdog.moneylineStatEdge,
            statScore: newUnderdog.statScore,
          }
        : null,
      total: refreshed.find((b) => b.betCategory === "total")?.betLabel,
      favorite: refreshed.find((b) => b.betCategory === "favorite")?.betLabel,
      totalsEdgeTrace: getLastTotalsEdgeTrace(),
      totalsEdgeTraceMeta: getLastTotalsEdgeTraceMeta(),
    });
  } catch (error) {
    console.error("[refresh-underdog-best-bet]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
