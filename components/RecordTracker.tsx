import type { RecordTotals } from "@/lib/records";

function RecordBadge({
  label,
  totals,
  accent,
}: {
  label: string;
  totals: RecordTotals;
  accent: "green" | "gold";
}) {
  const total = totals.wins + totals.losses;
  const pct =
    total > 0 ? Math.round((totals.wins / total) * 1000) / 10 : 0;

  const border =
    accent === "green" ? "border-[#00e676]/40" : "border-[#ffc107]/40";
  const labelColor = accent === "green" ? "text-[#00e676]" : "text-[#ffc107]";

  return (
    <div
      className={`rounded-xl border ${border} bg-[#0a120e]/90 px-5 py-3 backdrop-blur-sm`}
    >
      <p className={`text-[10px] font-bold uppercase tracking-[0.2em] ${labelColor}`}>
        {label}
      </p>
      <p className="mt-1 font-display text-3xl text-white">
        <span className="text-[#00e676]">{totals.wins}</span>
        <span className="mx-1 text-[#7a9a82]">–</span>
        <span className="text-red-400">{totals.losses}</span>
      </p>
      <p className="text-xs text-[#7a9a82]">
        {total} settled · {pct}% win rate
      </p>
    </div>
  );
}

export function RecordTracker({
  bestBets,
  aiPicks,
}: {
  bestBets: RecordTotals;
  aiPicks: RecordTotals;
}) {
  return (
    <div className="border-b border-[#1e3328] bg-[#0a120e]/60">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-4 px-4 py-4 sm:justify-end sm:px-6">
        <RecordBadge label="Best Bets Record" totals={bestBets} accent="gold" />
        <RecordBadge label="AI Picks Record" totals={aiPicks} accent="green" />
      </div>
    </div>
  );
}

export function ResultPill({ result }: { result: "win" | "loss" }) {
  const isWin = result === "win";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${
        isWin
          ? "border border-[#00e676]/50 bg-[#00e676]/15 text-[#00e676]"
          : "border border-red-500/50 bg-red-500/15 text-red-400"
      }`}
    >
      {isWin ? "✓ Win" : "✗ Loss"}
    </span>
  );
}
