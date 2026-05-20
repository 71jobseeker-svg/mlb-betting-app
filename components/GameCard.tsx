import { formatAmericanOdds, getFavoriteSide } from "@/lib/odds";
import type { EnrichedGame } from "@/lib/games";

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

      <div className="flex flex-wrap items-center justify-between gap-2 pr-28">
        <span className="rounded-md bg-[#1e3328] px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-[#7a9a82]">
          {game.status}
        </span>
        {game.bookmaker ? (
          <span className="text-xs text-[#5a7a62]">{game.bookmaker}</span>
        ) : null}
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <TeamBlock
          name={game.away}
          label="AWAY"
          odds={game.awayMoneyline}
          role={favorite === "away" ? "favorite" : favorite === "home" ? "underdog" : "neutral"}
        />

        <div className="hidden text-center sm:block">
          <span className="font-display text-3xl text-[#7a9a82]">VS</span>
        </div>

        <TeamBlock
          name={game.home}
          label="HOME"
          odds={game.homeMoneyline}
          role={favorite === "home" ? "favorite" : favorite === "away" ? "underdog" : "neutral"}
        />
      </div>

      <div className="sb-pick-box mt-8 rounded-xl p-5">
        <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#00e676]">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#00e676]" />
          AI Pick
        </p>
        <p className="text-base font-medium leading-relaxed text-white sm:text-lg">
          {game.recommendation}
        </p>
      </div>
    </li>
  );
}

function TeamBlock({
  name,
  label,
  odds,
  role,
}: {
  name: string;
  label: string;
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
      <p
        className={`mt-3 inline-block rounded-lg px-4 py-2 font-display text-4xl sm:text-5xl ${oddsColor} ${glowClass} bg-[#0a120e]/60`}
      >
        {formatAmericanOdds(odds)}
      </p>
    </div>
  );
}
