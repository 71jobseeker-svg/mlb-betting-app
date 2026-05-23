import { ResultPill } from "@/components/RecordTracker";
import { formatAmericanOdds, getFavoriteSide } from "@/lib/odds";
import type { EnrichedGame } from "@/lib/games";

function formatScore(score: number | null): string {
  if (score === null) return "—";
  return String(score);
}

export function GameCard({
  game,
  isTopBet,
  topBetRank,
}: {
  game: EnrichedGame;
  isTopBet?: boolean;
  topBetRank?: number;
}) {
  const favorite = getFavoriteSide(game.awayMoneyline, game.homeMoneyline);
  const runTotal =
    game.awayScore !== null && game.homeScore !== null
      ? game.awayScore + game.homeScore
      : null;

  return (
    <li
      className={`relative overflow-hidden rounded-2xl border bg-[#111a14] p-6 sm:p-8 ${
        isTopBet
          ? "border-[#ffc107]/50 ring-1 ring-[#ffc107]/30"
          : "border-[#1e3328]"
      }`}
    >
      {isTopBet && topBetRank ? (
        <span className="absolute right-4 top-4 rounded-full border border-[#ffc107] bg-[#ffc107]/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#ffc107]">
          ★ Best Bet #{topBetRank}
        </span>
      ) : null}

      <div className="mt-4 flex items-center justify-center gap-3 rounded-xl border-2 border-[#00e676]/50 bg-[#00e676]/10 px-6 py-4 sb-glow-green">
        <span className="text-xs font-bold uppercase tracking-[0.25em] text-[#7a9a82]">
          Start Time
        </span>
        <span className="font-display text-4xl tracking-wide text-[#00e676] sm:text-5xl">
          {game.startTime}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 pr-28">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-[#1e3328] px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-[#7a9a82]">
            {game.status}
          </span>
          {game.aiResult ? <ResultPill result={game.aiResult} /> : null}
          {game.bestBetResult ? (
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#ffc107]">
              Best Bet:
            </span>
          ) : null}
          {game.bestBetResult ? <ResultPill result={game.bestBetResult} /> : null}
        </div>
        {game.bookmaker ? (
          <span className="text-xs text-[#5a7a62]">{game.bookmaker}</span>
        ) : null}
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <TeamBlock
          name={game.away}
          label="AWAY"
          score={game.awayScore}
          odds={game.awayMoneyline}
          role={favorite === "away" ? "favorite" : favorite === "home" ? "underdog" : "neutral"}
        />

        <div className="flex flex-col items-center gap-2 text-center">
          <span className="font-display text-3xl text-[#7a9a82]">VS</span>
          <div className="rounded-lg border border-[#1e3328] bg-[#0a120e]/80 px-4 py-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#7a9a82]">
              Score
            </p>
            <p className="font-display text-3xl text-white sm:text-4xl">
              {formatScore(game.awayScore)}
              <span className="mx-1 text-[#7a9a82]">–</span>
              {formatScore(game.homeScore)}
            </p>
            {game.liveInning ? (
              <p className="mt-1 font-display text-lg tracking-wide text-[#00e676]">
                {game.liveInning}
              </p>
            ) : null}
          </div>
          {runTotal !== null ? (
            <p className="text-xs text-[#a8c4ae]">
              Runs: <span className="font-semibold text-white">{runTotal}</span>
            </p>
          ) : null}
          {game.totalPoint !== null ? (
            <div className="rounded-lg border border-[#ffc107]/20 bg-[#ffc107]/5 px-3 py-1.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#ffc107]">
                O/U {game.totalPoint}
              </p>
              <p className="text-xs text-[#a8c4ae]">
                O {formatAmericanOdds(game.overPrice)} · U{" "}
                {formatAmericanOdds(game.underPrice)}
              </p>
            </div>
          ) : null}
        </div>

        <TeamBlock
          name={game.home}
          label="HOME"
          score={game.homeScore}
          odds={game.homeMoneyline}
          role={favorite === "home" ? "favorite" : favorite === "away" ? "underdog" : "neutral"}
        />
      </div>

      <div className="sb-pick-box mt-8 rounded-xl p-5">
        {!game.picksAvailable ? (
          <p className="text-center text-sm leading-relaxed text-[#a8c4ae] sm:text-base">
            {game.recommendation}
          </p>
        ) : (
          <>
            <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#00e676]">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#00e676]" />
              AI ML Pick — {game.pickTeam} {formatAmericanOdds(game.pickOdds)}
            </p>
            <p className="text-base font-medium leading-relaxed text-white sm:text-lg">
              {game.recommendation}
            </p>
            {game.totalsPick && game.totalsRecommendation ? (
              <div className="mt-4 border-t border-[#ffc107]/20 pt-4">
                <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#ffc107]">
                  AI O/U Pick — {game.totalsPick === "over" ? "Over" : "Under"}{" "}
                  {game.totalPoint}{" "}
                  {formatAmericanOdds(
                    game.totalsPick === "over" ? game.overPrice : game.underPrice
                  )}
                  <span className="ml-1 rounded bg-[#ffc107]/20 px-1.5 py-0.5 text-[10px] text-[#ffc107]">
                    {game.totalsStatEdge}/10 edge
                  </span>
                </p>
                <p className="text-sm leading-relaxed text-[#a8c4ae]">
                  {game.totalsRecommendation}
                </p>
              </div>
            ) : null}
          </>
        )}
      </div>
    </li>
  );
}

function TeamBlock({
  name,
  label,
  score,
  odds,
  role,
}: {
  name: string;
  label: string;
  score: number | null;
  odds: number | null;
  role: "favorite" | "underdog" | "neutral";
}) {
  const oddsColor =
    role === "favorite"
      ? "text-[#00e676]"
      : role === "underdog"
        ? "text-[#ffc107]"
        : "text-white";

  const glowClass =
    role === "favorite" ? "sb-glow-green" : role === "underdog" ? "sb-glow-gold" : "";

  return (
    <div className="text-center sm:text-left">
      <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#7a9a82]">
        {label}
        {role === "favorite" && (
          <span className="ml-2 text-[#00e676]">FAV</span>
        )}
        {role === "underdog" && (
          <span className="ml-2 text-[#ffc107]">DOG</span>
        )}
      </p>
      <p className="mt-1 font-display text-3xl leading-none text-white sm:text-4xl">{name}</p>
      <p className="mt-2 font-display text-4xl text-white/90 sm:text-5xl">
        {formatScore(score)}
      </p>
      <p
        className={`mt-2 inline-block rounded-lg px-4 py-2 font-display text-3xl sm:text-4xl ${oddsColor} ${glowClass} bg-[#0a120e]/60`}
      >
        {formatAmericanOdds(odds)}
      </p>
    </div>
  );
}
