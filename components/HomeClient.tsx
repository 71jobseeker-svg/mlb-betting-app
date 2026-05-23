"use client";

import { useMemo } from "react";
import { BestBetsPanel } from "@/components/BestBetsPanel";
import { GameCard } from "@/components/GameCard";
import { Header } from "@/components/Header";
import type { BestBet } from "@/lib/best-bets";
import type { EnrichedGame } from "@/lib/games";
import type { RecordTotals } from "@/lib/persistence/types";

type HomeClientProps = {
  slateDate: string;
  games: EnrichedGame[];
  bestBets: BestBet[];
  picksMessage: string | null;
  totals: {
    bestBets: RecordTotals;
    aiPicks: RecordTotals;
  };
};

export function HomeClient({
  slateDate,
  games,
  bestBets,
  picksMessage,
  totals,
}: HomeClientProps) {
  const bestBetRanks = useMemo(() => {
    const map = new Map<number, number>();
    for (const bet of bestBets) {
      const existing = map.get(bet.gamePk);
      if (!existing || bet.rank < existing) {
        map.set(bet.gamePk, bet.rank);
      }
    }
    return map;
  }, [bestBets]);

  const displayDate = `${slateDate} (PT)`;

  return (
    <div className="sb-grid-bg min-h-full bg-[#060a08]">
      <Header
        date={displayDate}
        gameCount={games.length}
        bestBetsRecord={totals.bestBets}
        aiPicksRecord={totals.aiPicks}
      />

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        {games.length === 0 ? (
          <p className="text-center text-[#7a9a82]">No games scheduled today.</p>
        ) : (
          <div className="space-y-10">
            <BestBetsPanel
              bestBets={bestBets}
              pendingMessage={picksMessage}
            />

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
          Slate day resets at midnight Pacific (PT). Gamble responsibly. 21+
        </footer>
      </main>
    </div>
  );
}
