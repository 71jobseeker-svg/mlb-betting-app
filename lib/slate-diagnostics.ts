import "server-only";

import {
  formatPacificTime,
  getTodayInPacific,
  isAfter8amPacific,
} from "@/lib/date";
import {
  canGenerateAndLockPicks,
  countOddsCoverage,
  hasFullSlateMoneylineOdds,
  isPickableGame,
} from "@/lib/slate-picks-ready";
import { isRecordsPaused } from "@/lib/persistence/reset";
import { loadMeta } from "@/lib/persistence/store";

type GameForDiag = {
  gamePk: number;
  away: string;
  home: string;
  awayMoneyline: number | null;
  homeMoneyline: number | null;
  isFinal: boolean;
  status: string;
};

export function logSlatePipeline(
  stage: string,
  context: Record<string, unknown>
): void {
  console.log(`[DiamondEdge:${stage}]`, JSON.stringify(context, null, 0));
}

export async function logSlateGateDiagnostics(
  slateDate: string,
  shells: GameForDiag[]
): Promise<void> {
  const meta = await loadMeta();
  const coverage = countOddsCoverage(shells);
  const after8 = isAfter8amPacific();
  const fullOdds = hasFullSlateMoneylineOdds(shells);
  const canLock = canGenerateAndLockPicks(shells);
  const paused = isRecordsPaused(slateDate, meta);

  const missingPickable = shells
    .filter(isPickableGame)
    .filter((g) => g.awayMoneyline === null || g.homeMoneyline === null)
    .map((g) => ({
      gamePk: g.gamePk,
      away: g.away,
      home: g.home,
      awayML: g.awayMoneyline,
      homeML: g.homeMoneyline,
      status: g.status,
    }));

  logSlatePipeline("gate-check", {
    slateDate,
    todayPT: getTodayInPacific(),
    nowPT: formatPacificTime(),
    isAfter8amPT: after8,
    recordsPaused: paused,
    meta,
    gameCount: shells.length,
    pickableGames: coverage.pickable,
    gamesWithOdds: coverage.withOdds,
    hasFullSlateMoneylineOdds: fullOdds,
    canGenerateAndLockPicks: canLock,
    missingOddsPickable: missingPickable,
  });
}
