import { HomeClient } from "@/components/HomeClient";
import { getTodaysGamesWithAnalysis } from "@/lib/games";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function Home() {
  const { date, games, bestBets, picksMessage, totals } =
    await getTodaysGamesWithAnalysis();

  return (
    <HomeClient
      slateDate={date}
      games={games}
      bestBets={bestBets}
      picksMessage={picksMessage}
      totals={totals}
    />
  );
}
