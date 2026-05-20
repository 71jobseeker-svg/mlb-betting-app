export function Header({ date, gameCount }: { date: string; gameCount: number }) {
  return (
    <header className="relative overflow-hidden border-b border-[#1e3328] bg-[#0a120e]/90 backdrop-blur-md">
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#00e67608] via-transparent to-[#ffc10708]"
        aria-hidden
      />
      <div className="relative mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <div className="flex items-center gap-4">
          <Logo />
          <div>
            <h1 className="font-display text-4xl leading-none tracking-wide text-white sm:text-5xl">
              DIAMOND<span className="text-[#00e676]">EDGE</span>
            </h1>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.25em] text-[#7a9a82]">
              MLB Live Odds & AI Picks
            </p>
          </div>
        </div>
        <div className="hidden text-right sm:block">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#ffc107]">
            Today&apos;s Slate
          </p>
          <p className="font-display text-2xl text-white">{date}</p>
          <p className="text-sm text-[#7a9a82]">
            {gameCount} {gameCount === 1 ? "game" : "games"}
          </p>
        </div>
      </div>
    </header>
  );
}

function Logo() {
  return (
    <div
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
    </div>
  );
}
