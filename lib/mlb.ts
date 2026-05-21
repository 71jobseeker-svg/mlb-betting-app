const MLB_SCHEDULE_BASE = "https://statsapi.mlb.com/api/v1/schedule";

export type MlbScheduleResponse = {
  dates?: Array<{
    date: string;
    games?: Array<{
      gamePk: number;
      gameDate: string;
      status?: {
        detailedState?: string;
        abstractGameState?: string;
      };
      teams?: {
        away?: { team?: { name?: string }; score?: number; isWinner?: boolean };
        home?: { team?: { name?: string }; score?: number; isWinner?: boolean };
      };
      linescore?: {
        teams?: {
          away?: { runs?: number };
          home?: { runs?: number };
        };
      };
    }>;
  }>;
};

export function extractGameScores(game: NonNullable<
  NonNullable<MlbScheduleResponse["dates"]>[0]["games"]
>[0]): { awayScore: number | null; homeScore: number | null } {
  const awayScore =
    game.teams?.away?.score ?? game.linescore?.teams?.away?.runs ?? null;
  const homeScore =
    game.teams?.home?.score ?? game.linescore?.teams?.home?.runs ?? null;

  return {
    awayScore: awayScore ?? null,
    homeScore: homeScore ?? null,
  };
}

export function extractGameResult(
  game: NonNullable<NonNullable<MlbScheduleResponse["dates"]>[0]["games"]>[0]
): {
  isFinal: boolean;
  awayWon: boolean | null;
} {
  const state = game.status?.abstractGameState ?? "";
  const detailed = game.status?.detailedState ?? "";
  const isFinal = state === "Final" || detailed === "Final";

  if (!isFinal) return { isFinal: false, awayWon: null };

  if (game.teams?.away?.isWinner === true) return { isFinal: true, awayWon: true };
  if (game.teams?.home?.isWinner === true) return { isFinal: true, awayWon: false };

  const { awayScore, homeScore } = extractGameScores(game);
  if (awayScore === null || homeScore === null) return { isFinal: true, awayWon: null };
  if (awayScore === homeScore) return { isFinal: true, awayWon: null };

  return { isFinal: true, awayWon: awayScore > homeScore };
}

export async function fetchMlbSchedule(date: string): Promise<MlbScheduleResponse> {
  const url = `${MLB_SCHEDULE_BASE}?sportId=1&date=${date}&hydrate=linescore`;
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    throw new Error(`MLB API failed: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<MlbScheduleResponse>;
}

export async function fetchMlbScheduleRange(
  startDate: string,
  endDate: string
): Promise<NonNullable<MlbScheduleResponse["dates"]>> {
  const url = `${MLB_SCHEDULE_BASE}?sportId=1&startDate=${startDate}&endDate=${endDate}&hydrate=linescore`;
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    throw new Error(`MLB API failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as MlbScheduleResponse;
  return data.dates ?? [];
}

export function logScheduleResults(data: MlbScheduleResponse, date: string) {
  const games = data.dates?.[0]?.games ?? [];

  console.log("MLB schedule JSON:", JSON.stringify(data, null, 2));
  console.log(`Games on ${date}: ${games.length}`);

  for (const game of games) {
    const away = game.teams?.away?.team?.name ?? "Away";
    const home = game.teams?.home?.team?.name ?? "Home";
    const status = game.status?.detailedState ?? "Unknown";
    console.log(`  [${game.gamePk}] ${away} @ ${home} — ${status}`);
  }
}
