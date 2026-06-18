import { ResultPill } from "@/components/RecordTracker";
import { formatAmericanOdds } from "@/lib/odds";
import type { BestBet } from "@/lib/best-bets";
import type { EnrichedGame } from "@/lib/games";

function formatScore(score: number | null): string {
  if (score === null) return "—";
  return String(score);
}

function resolveBetScores(
  bet: BestBet,
  gamesByPk: Map<number, EnrichedGame>
): {
  awayScore: number | null;
  homeScore: number | null;
  isFinal: boolean;
} {
  const game = gamesByPk.get(bet.gamePk);
  return {
    awayScore: game?.awayScore ?? bet.awayScore,
    homeScore: game?.homeScore ?? bet.homeScore,
    isFinal: game?.isFinal ?? bet.isFinal,
  };
}

function BestBetCard({
  bet,
  gamesByPk,
}: {
  bet: BestBet;
  gamesByPk: Map<number, EnrichedGame>;
}) {
  const { awayScore, homeScore, isFinal } = resolveBetScores(bet, gamesByPk);
  const hasFinalScore =
    isFinal && awayScore !== null && homeScore !== null;

  return (
    <li
      className="relative overflow-hidden rounded-xl border border-[#ffc107]/30 bg-[#0a120e]/80 p-5"
    >
      <span className="absolute right-3 top-3 font-display text-5xl leading-none text-[#ffc107]/20">
        #{bet.rank}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-block rounded-full bg-[#ffc107] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#0a120e]">
          #{bet.rank} {bet.betType === "total" ? "O/U" : "ML"}
        </span>
        {bet.bestBetResult ? (
          <ResultPill result={bet.bestBetResult} />
        ) : bet.aiResult && bet.betType === "moneyline" ? (
          <ResultPill result={bet.aiResult} />
        ) : null}
      </div>
      <p className="mt-2 font-display text-2xl text-[#00e676]">{bet.startTime}</p>
      <p className="mt-2 font-display text-xl leading-tight text-white">{bet.away}</p>
      <p className="text-xs font-semibold uppercase tracking-widest text-[#7a9a82]">@</p>
      <p className="font-display text-xl leading-tight text-white">{bet.home}</p>
      {hasFinalScore ? (
        <div className="mt-3 rounded-lg border border-[#1e3328] bg-[#060a08]/80 px-3 py-2 text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#7a9a82]">
            Final Score
          </p>
          <p className="font-display text-2xl text-white sm:text-3xl">
            {formatScore(awayScore)}
            <span className="mx-1 text-[#7a9a82]">–</span>
            {formatScore(homeScore)}
          </p>
        </div>
      ) : null}
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
  );
}

export function BestBetsPanel({
  bestBets,
  games = [],
  pendingMessage,
}: {
  bestBets: BestBet[];
  games?: EnrichedGame[];
  pendingMessage?: string | null;
}) {
  const gamesByPk = new Map(games.map((g) => [g.gamePk, g]));
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
          Top O/U edge, top ML favorite, and top plus-money dog — locked at
          generation
        </p>
      </div>

      <ol className="grid gap-4 sm:grid-cols-3">
        {bestBets.map((bet) => (
          <BestBetCard
            key={`${bet.gamePk}-${bet.betType}`}
            bet={bet}
            gamesByPk={gamesByPk}
          />
        ))}
      </ol>
    </section>
  );
}
