const MLB_SCHEDULE_BASE = "https://statsapi.mlb.com/api/v1/schedule";

export type MlbScheduleResponse = {
  dates?: Array<{
    date: string;
    games?: Array<{
      gamePk: number;
      gameDate: string;
      status?: { detailedState?: string };
      teams?: {
        away?: { team?: { name?: string } };
        home?: { team?: { name?: string } };
      };
    }>;
  }>;
};

export async function fetchMlbSchedule(date: string): Promise<MlbScheduleResponse> {
  const url = `${MLB_SCHEDULE_BASE}?sportId=1&date=${date}`;
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    throw new Error(`MLB API failed: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<MlbScheduleResponse>;
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
