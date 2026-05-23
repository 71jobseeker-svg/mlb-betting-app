import { ResultPill } from "@/components/RecordTracker";
import { formatAmericanOdds } from "@/lib/odds";
import type { BestBet } from "@/lib/best-bets";

export function BestBetsPanel({
  bestBets,
  pendingMessage,
}: {
  bestBets: BestBet[];
  pendingMessage?: string | null;
}) {
  if (pendingMessage) {
    return (
      <section className="sb-best-bets-box rounded-2xl p-6 sm:p-8">
        <div className="mb-4">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#ffc107]">
            ★ Top Plays
          </p>
          <h2 className="font-display text-4xl tracking-wide text-white sm:text-5xl">
            BEST BETS OF THE DAY
          </h2>
        </div>
        <p className="text-center text-sm leading-relaxed text-[#a8c4ae] sm:text-base">
          {pendingMessage}
        </p>
      </section>
    );
  }

  if (bestBets.length === 0) return null;

  return (
    <section className="sb-best-bets-box rounded-2xl p-6 sm:p-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#ffc107]">
            ★ Top Plays
          </p>
          <h2 className="font-display text-4xl tracking-wide text-white sm:text-5xl">
            BEST BETS OF THE DAY
          </h2>
        </div>
        <p className="max-w-xs text-right text-xs text-[#a8c4ae]">
          Highest AI edge across the slate (ML confidence + O/U 7+), locked at
          generation
        </p>
      </div>

      <ol className="grid gap-4 sm:grid-cols-3">
        {bestBets.map((bet) => (
          <li
            key={`${bet.gamePk}-${bet.betType}`}
            className="relative overflow-hidden rounded-xl border border-[#ffc107]/30 bg-[#0a120e]/80 p-5"
          >
            <span className="absolute right-3 top-3 font-display text-5xl leading-none text-[#ffc107]/20">
              #{bet.rank}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-block rounded-full bg-[#ffc107] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#0a120e]">
                #{bet.rank}{" "}
                {bet.betType === "total" ? "O/U" : "ML"}
              </span>
              {bet.bestBetResult ? (
                <ResultPill result={bet.bestBetResult} />
              ) : bet.aiResult && bet.betType === "moneyline" ? (
                <ResultPill result={bet.aiResult} />
              ) : null}
            </div>
            <p className="mt-2 font-display text-2xl text-[#00e676]">
              {bet.startTime}
            </p>
            <p className="mt-2 font-display text-xl leading-tight text-white">
              {bet.away}
            </p>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#7a9a82]">
              @
            </p>
            <p className="font-display text-xl leading-tight text-white">{bet.home}</p>
            {(bet.awayScore !== null || bet.homeScore !== null) && (
              <p className="mt-2 font-display text-xl text-white/80">
                {bet.awayScore ?? "—"} – {bet.homeScore ?? "—"}
              </p>
            )}
            <p
              className={`mt-4 font-display text-3xl ${
                bet.betType === "total" ? "text-[#ffc107]" : "text-[#00e676]"
              }`}
            >
              {bet.betLabel}
            </p>
            <p className="font-display text-2xl text-white/90">
              {bet.betType === "total" ? "" : "ML "}
              {formatAmericanOdds(bet.betOdds)}
            </p>
            <p className="mt-1 text-xs font-bold uppercase tracking-wider text-[#ffc107]">
              {bet.betType === "total"
                ? `${bet.totalsStatEdge}/10 edge`
                : `${bet.moneylineStatEdge}/10 ML edge`}
              {" · "}
              score {Math.round(bet.statScore * 100) / 100}
            </p>
            <p className="mt-3 text-xs leading-relaxed text-[#a8c4ae]">{bet.statReason}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
