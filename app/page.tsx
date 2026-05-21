import { BestBetsPanel } from "@/components/BestBetsPanel";
import { GameCard } from "@/components/GameCard";
import { Header } from "@/components/Header";
import { selectBestBets } from "@/lib/best-bets";
import { getTodaysGamesWithAnalysis } from "@/lib/games";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function Home() {
  const { date, games, totals } = await getTodaysGamesWithAnalysis();
  const bestBets = selectBestBets(games);
  const bestBetRanks = new Map(bestBets.map((b) => [b.gamePk, b.rank]));

  return (
    <div className="sb-grid-bg min-h-full bg-[#060a08]">
      <Header
        date={date}
        gameCount={games.length}
        bestBetsRecord={totals.bestBets}
        aiPicksRecord={totals.aiPicks}
      />

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        {games.length === 0 ? (
          <p className="text-center text-[#7a9a82]">No games scheduled today.</p>
        ) : (
          <div className="space-y-10">
            <BestBetsPanel bestBets={bestBets} />

            <section>
              <div className="mb-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#00e676]/40 to-transparent" />
                <h2 className="font-display text-2xl tracking-widest text-white sm:text-3xl">
                  FULL SLATE
                </h2>
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#00e676]/40 to-transparent" />
              </div>

              <ul className="space-y-6">
                {games.map((game) => (
                  <GameCard
                    key={game.gamePk}
                    game={game}
                    isTopBet={bestBetRanks.has(game.gamePk)}
                    topBetRank={bestBetRanks.get(game.gamePk)}
                  />
                ))}
              </ul>
            </section>
          </div>
        )}

        <footer className="mt-12 border-t border-[#1e3328] pt-6 text-center text-xs text-[#5a7a62]">
          Odds via The Odds API · AI analysis for entertainment only — not financial advice.
          <br />
          Gamble responsibly. 21+
        </footer>
      </main>
    </div>
  );
}
