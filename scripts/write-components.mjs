import { writeFileSync } from "fs";

const d = "div";

const header = `export function Header({ date, gameCount }: { date: string; gameCount: number }) {
  return (
    <header className="relative overflow-hidden border-b border-[#1e3328] bg-[#0a120e]/90 backdrop-blur-md">
      <${d}
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#00e67608] via-transparent to-[#ffc10708]"
        aria-hidden
      />
      <${d} className="relative mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <${d} className="flex items-center gap-4">
          <Logo />
          <${d}>
            <h1 className="font-display text-4xl leading-none tracking-wide text-white sm:text-5xl">
              DIAMOND<span className="text-[#00e676]">EDGE</span>
            </h1>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.25em] text-[#7a9a82]">
              MLB Live Odds & AI Picks
            </p>
          </${d}>
        </${d}>
        <${d} className="hidden text-right sm:block">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#ffc107]">
            Today&apos;s Slate
          </p>
          <p className="font-display text-2xl text-white">{date}</p>
          <p className="text-sm text-[#7a9a82]">
            {gameCount} {gameCount === 1 ? "game" : "games"}
          </p>
        </${d}>
      </${d}>
    </header>
  );
}

function Logo() {
  return (
    <${d}
      className="sb-glow-green flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-[#00e676]/40 bg-[#0d1a12]"
      aria-hidden
    >
      <svg viewBox="0 0 48 48" className="h-9 w-9" fill="none">
        <circle cx="24" cy="24" r="20" stroke="#00e676" strokeWidth="2" />
        <path
          d="M24 8c-4 6-6 12-6 16s2 10 6 16M24 8c4 6 6 12 6 16s-2 10-6 16"
          stroke="#ffc107"
          strokeWidth="1.5"
        />
        <path d="M10 24h28" stroke="#00e676" strokeWidth="1.5" strokeOpacity="0.6" />
        <text
          x="24"
          y="28"
          textAnchor="middle"
          fill="#ffc107"
          fontSize="11"
          fontWeight="bold"
          fontFamily="system-ui"
        >
          $
        </text>
      </svg>
    </${d}>
  );
}
`;

const gameCard = `import { formatAmericanOdds, getFavoriteSide } from "@/lib/odds";
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
      className={\`relative overflow-hidden rounded-2xl border bg-[#111a14] p-6 sm:p-8 \${
        isTopBet
          ? "border-[#ffc107]/50 ring-1 ring-[#ffc107]/30"
          : "border-[#1e3328]"
      }\`}
    >
      {isTopBet && topBetRank ? (
        <span className="absolute right-4 top-4 rounded-full border border-[#ffc107] bg-[#ffc107]/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#ffc107]">
          ★ Best Bet #{topBetRank}
        </span>
      ) : null}

      <${d} className="flex flex-wrap items-center justify-between gap-2 pr-28">
        <span className="rounded-md bg-[#1e3328] px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-[#7a9a82]">
          {game.status}
        </span>
        {game.bookmaker ? (
          <span className="text-xs text-[#5a7a62]">{game.bookmaker}</span>
        ) : null}
      </${d}>

      <${d} className="mt-6 grid gap-6 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <TeamBlock
          name={game.away}
          label="AWAY"
          odds={game.awayMoneyline}
          role={favorite === "away" ? "favorite" : favorite === "home" ? "underdog" : "neutral"}
        />

        <${d} className="hidden text-center sm:block">
          <span className="font-display text-3xl text-[#7a9a82]">VS</span>
        </${d}>

        <TeamBlock
          name={game.home}
          label="HOME"
          odds={game.homeMoneyline}
          role={favorite === "home" ? "favorite" : favorite === "away" ? "underdog" : "neutral"}
        />
      </${d}>

      <${d} className="sb-pick-box mt-8 rounded-xl p-5">
        <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#00e676]">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#00e676]" />
          AI Pick
        </p>
        <p className="text-base font-medium leading-relaxed text-white sm:text-lg">
          {game.recommendation}
        </p>
      </${d}>
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
    <${d} className="text-center sm:text-left">
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
        className={\`mt-3 inline-block rounded-lg px-4 py-2 font-display text-4xl sm:text-5xl \${oddsColor} \${glowClass} bg-[#0a120e]/60\`}
      >
        {formatAmericanOdds(odds)}
      </p>
    </${d}>
  );
}
`;

const page = `import { BestBetsPanel } from "@/components/BestBetsPanel";
import { GameCard } from "@/components/GameCard";
import { Header } from "@/components/Header";
import { selectBestBets } from "@/lib/best-bets";
import { getTodaysGamesWithAnalysis } from "@/lib/games";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { date, games } = await getTodaysGamesWithAnalysis();
  const bestBets = selectBestBets(games);
  const bestBetRanks = new Map(bestBets.map((b) => [b.gamePk, b.rank]));

  return (
    <${d} className="sb-grid-bg min-h-full bg-[#060a08]">
      <Header date={date} gameCount={games.length} />

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        {games.length === 0 ? (
          <p className="text-center text-[#7a9a82]">No games scheduled today.</p>
        ) : (
          <${d} className="space-y-10">
            <BestBetsPanel bestBets={bestBets} />

            <section>
              <${d} className="mb-6 flex items-center gap-3">
                <${d} className="h-px flex-1 bg-gradient-to-r from-transparent via-[#00e676]/40 to-transparent" />
                <h2 className="font-display text-2xl tracking-widest text-white sm:text-3xl">
                  FULL SLATE
                </h2>
                <${d} className="h-px flex-1 bg-gradient-to-r from-transparent via-[#00e676]/40 to-transparent" />
              </${d}>

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
          </${d}>
        )}

        <footer className="mt-12 border-t border-[#1e3328] pt-6 text-center text-xs text-[#5a7a62]">
          Odds via The Odds API · AI analysis for entertainment only — not financial advice.
          <br />
          Gamble responsibly. 21+
        </footer>
      </main>
    </${d}>
  );
}
`;

writeFileSync("components/Header.tsx", header);
writeFileSync("components/GameCard.tsx", gameCard);
writeFileSync("app/page.tsx", page);
console.log("done");
