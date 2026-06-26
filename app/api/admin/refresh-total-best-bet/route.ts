import { NextResponse } from "next/server";
import { getLastTotalsEdgeTrace, getLastTotalsEdgeTraceMeta } from "@/lib/analysis";
import { getTodayInPacific } from "@/lib/date";
import { getTodaysGamesForBestBetRefresh } from "@/lib/games";
import { refreshLockedTotalBestBet } from "@/lib/lock-picks";
import { bestBetsKey } from "@/lib/persistence/keys";
import { loadLockedBestBets } from "@/lib/persistence/store";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/admin/refresh-total-best-bet
 * Re-locks only today's O/U best bet in Redis; ML favorite and underdog unchanged.
 */
export async function POST() {
  try {
    const slateDate = getTodayInPacific();
    const before = await loadLockedBestBets(slateDate);
    const oldTotal = before?.find((b) => b.betCategory === "total");

    const { games } = await getTodaysGamesForBestBetRefresh();
    const refreshed = await refreshLockedTotalBestBet(slateDate, games);

    if (!refreshed) {
      return NextResponse.json(
        { error: "Could not refresh O/U best bet", slateDate, redisKey: bestBetsKey(slateDate) },
        { status: 400 }
      );
    }

    const newTotal = refreshed.find((b) => b.betCategory === "total");

    return NextResponse.json({
      ok: true,
      slateDate,
      redisKey: bestBetsKey(slateDate),
      note: "O/U is not a separate Redis key; it is the betCategory total entry in that array.",
      previousTotal: oldTotal
        ? {
            betLabel: oldTotal.betLabel,
            gamePk: oldTotal.gamePk,
            totalsStatEdge: oldTotal.totalsStatEdge,
            statScore: oldTotal.statScore,
          }
        : null,
      newTotal: newTotal
        ? {
            betLabel: newTotal.betLabel,
            gamePk: newTotal.gamePk,
            betOdds: newTotal.betOdds,
            totalsStatEdge: newTotal.totalsStatEdge,
            statScore: newTotal.statScore,
          }
        : null,
      favorite: refreshed.find((b) => b.betCategory === "favorite")?.betLabel,
      underdog: refreshed.find((b) => b.betCategory === "underdog")?.betLabel,
      totalsEdgeTrace: getLastTotalsEdgeTrace(),
      totalsEdgeTraceMeta: getLastTotalsEdgeTraceMeta(),
    });
  } catch (error) {
    console.error("[refresh-total-best-bet]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
