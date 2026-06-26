import { formatRunLineSpread } from "@/lib/odds";
import { parseAiPick, parseAiRunLine } from "@/lib/picks";

export type GameForAnalysis = {
  gamePk: number;
  away: string;
  home: string;
  status: string;
  startTime: string;
  awayMoneyline: number | null;
  homeMoneyline: number | null;
  awayRunLinePoint: number | null;
  awayRunLinePrice: number | null;
  homeRunLinePoint: number | null;
  homeRunLinePrice: number | null;
  totalPoint: number | null;
  overPrice: number | null;
  underPrice: number | null;
};

export type GameAnalysis = {
  moneylineRecommendation: string;
  /** AI confidence / edge for moneyline (0–10). */
  moneylineStatEdge: number;
  runLinePickSide: "away" | "home" | null;
  runLineRecommendation: string | null;
  /** AI confidence / edge for run line (0–10). */
  runLineStatEdge: number;
  totalsPick: "over" | "under" | null;
  totalsRecommendation: string | null;
  /** AI statistical edge for O/U (0–10). Best bets use picks with edge >= 7. */
  totalsStatEdge: number;
};

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

type AiResponseItem = {
  gamePk: number;
  moneylineRecommendation?: string;
  recommendation?: string;
  moneylineStatEdge?: number;
  runLinePickSide?: "away" | "home" | null;
  runLineRecommendation?: string | null;
  runLineStatEdge?: number;
  totalsPick?: "over" | "under" | null;
  totalsRecommendation?: string | null;
  totalsStatEdge?: number;
};

const PASS_PATTERN =
  /\bpass\b|no\s+(clear\s+)?edge|no\s+bet|skip|stay\s+away|avoid\s+betting/i;

export type TotalsEdgeTraceEntry = {
  gamePk: number;
  away: string;
  home: string;
  source: "ai" | "fallback" | "missing-from-response";
  rawTotalsStatEdge: unknown;
  rawTotalsPick: unknown;
  normalizedTotalsStatEdge: number;
  normalizedTotalsPick: "over" | "under" | null;
  pickStrippedBelow7: boolean;
};

export type TotalsEdgeTraceMeta = {
  anthropicOutcome:
    | "ok"
    | "no-api-key"
    | "http-error"
    | "json-parse-error"
    | "empty-response";
  httpStatus?: number;
  errorSnippet?: string;
  gamesRequested: number;
  parsedItems: number;
  responseChars?: number;
  stopReason?: string;
};

let lastTotalsEdgeTrace: TotalsEdgeTraceEntry[] = [];
let lastTotalsEdgeTraceMeta: TotalsEdgeTraceMeta | null = null;

/** Most recent per-game totals edge trace (for /api/slate-debug). */
export function getLastTotalsEdgeTrace(): TotalsEdgeTraceEntry[] {
  return lastTotalsEdgeTrace;
}

export function getLastTotalsEdgeTraceMeta(): TotalsEdgeTraceMeta | null {
  return lastTotalsEdgeTraceMeta;
}

function logTotalsEdgeTrace(
  entries: TotalsEdgeTraceEntry[],
  meta: TotalsEdgeTraceMeta
): void {
  lastTotalsEdgeTrace = entries;
  lastTotalsEdgeTraceMeta = meta;
  console.warn(
    `[TotalsEdge] trace summary — outcome=${meta.anthropicOutcome} games=${entries.length}, ai=${entries.filter((e) => e.source === "ai").length}, fallback=${entries.filter((e) => e.source === "fallback").length}, missing=${entries.filter((e) => e.source === "missing-from-response").length}, edge>0=${entries.filter((e) => e.normalizedTotalsStatEdge > 0).length}, edge>=7=${entries.filter((e) => e.normalizedTotalsStatEdge >= 7).length}${meta.httpStatus ? ` httpStatus=${meta.httpStatus}` : ""}${meta.errorSnippet ? ` err=${meta.errorSnippet.slice(0, 120)}` : ""}`
  );
  for (const entry of entries) {
    console.warn(
      `[TotalsEdge] gamePk=${entry.gamePk} ${entry.away}@${entry.home} source=${entry.source} rawEdge=${JSON.stringify(entry.rawTotalsStatEdge)} rawPick=${JSON.stringify(entry.rawTotalsPick)} normalizedEdge=${entry.normalizedTotalsStatEdge} normalizedPick=${entry.normalizedTotalsPick ?? "null"} strippedBelow7=${entry.pickStrippedBelow7}`
    );
  }
}

export async function generateBettingRecommendations(
  games: GameForAnalysis[]
): Promise<Map<number, GameAnalysis>> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const results = new Map<number, GameAnalysis>();

  if (!apiKey) {
    console.warn("[TotalsEdge] ANTHROPIC_API_KEY missing — using fallback (edge 0)");
    const trace: TotalsEdgeTraceEntry[] = [];
    for (const game of games) {
      trace.push({
        gamePk: game.gamePk,
        away: game.away,
        home: game.home,
        source: "fallback",
        rawTotalsStatEdge: null,
        rawTotalsPick: null,
        normalizedTotalsStatEdge: 0,
        normalizedTotalsPick: null,
        pickStrippedBelow7: false,
      });
      results.set(game.gamePk, fallbackAnalysis(game));
    }
    logTotalsEdgeTrace(trace, {
      anthropicOutcome: "no-api-key",
      gamesRequested: games.length,
      parsedItems: 0,
    });
    return results;
  }

  if (games.length === 0) return results;

  const prompt = `You are an MLB betting analyst. For EVERY game provide a moneyline pick, a run line pick (standard -1.5 / +1.5), AND evaluate the total (over/under).

Rules:
- Moneyline: ALWAYS pick one team. Never pass. One sentence, cite American odds.
- moneylineStatEdge: integer 0-10 (your confidence/statistical edge on the ML pick; 10=maximum).
- Run line: ALWAYS pick one side at the listed spread (-1.5 favorite lay or +1.5 underdog). runLinePickSide must be "away" or "home". One sentence citing the run line American odds.
- runLineStatEdge: integer 0-10 (confidence on the run line pick).
- Totals: ALWAYS assign totalsStatEdge 1-10 for every game (rate your confidence on the O/U based on line value, pitching, weather, park factors). Use 1=no lean, 5=slight lean, 7+=actionable edge, 10=maximum confidence.
- Set totalsPick to "over" or "under" only when totalsStatEdge is 7 or higher. When edge is below 7, totalsPick must be null.
- totalsRecommendation: one sentence explaining the O/U pick when totalsPick is set, otherwise null.
- Return ONLY valid JSON array:
[{"gamePk":number,"moneylineRecommendation":"...","moneylineStatEdge":number,"runLinePickSide":"away"|"home","runLineRecommendation":"...","runLineStatEdge":number,"totalsPick":"over"|"under"|null,"totalsRecommendation":"..."|null,"totalsStatEdge":number}]

Games:
${games
  .map((g) => {
    const ou =
      g.totalPoint !== null
        ? `O/U ${g.totalPoint} (O ${formatOdds(g.overPrice)} / U ${formatOdds(g.underPrice)})`
        : "O/U N/A";
    const rl = formatRunLineForPrompt(g);
    return `- gamePk ${g.gamePk}: ${g.away} @ ${g.home} | ${g.startTime} | ${g.status} | ML: ${g.away} ${formatOdds(g.awayMoneyline)}, ${g.home} ${formatOdds(g.homeMoneyline)} | ${rl} | ${ou}`;
  })
  .join("\n")}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Anthropic API failed:", res.status, err);
    const trace: TotalsEdgeTraceEntry[] = [];
    for (const game of games) {
      trace.push({
        gamePk: game.gamePk,
        away: game.away,
        home: game.home,
        source: "fallback",
        rawTotalsStatEdge: null,
        rawTotalsPick: null,
        normalizedTotalsStatEdge: 0,
        normalizedTotalsPick: null,
        pickStrippedBelow7: false,
      });
      results.set(game.gamePk, fallbackAnalysis(game));
    }
    logTotalsEdgeTrace(trace, {
      anthropicOutcome: "http-error",
      httpStatus: res.status,
      errorSnippet: err.slice(0, 300),
      gamesRequested: games.length,
      parsedItems: 0,
    });
    return results;
  }
    content?: Array<{ type: string; text?: string }>;
    stop_reason?: string;
  };

  const text = data.content?.find((c) => c.type === "text")?.text ?? "[]";
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  let parsed: AiResponseItem[] = [];
  let parseFailed = false;

  try {
    parsed = JSON.parse(jsonMatch?.[0] ?? "[]") as AiResponseItem[];
  } catch {
    parseFailed = true;
    console.error("Failed to parse Anthropic JSON:", text.slice(0, 500));
  }

  console.warn(
    `[TotalsEdge] Anthropic response — gamesRequested=${games.length} parsedItems=${parsed.length} responseChars=${text.length} stopReason=${data.stop_reason ?? "unknown"}`
  );

  const gamesByPk = new Map(games.map((g) => [g.gamePk, g]));
  const trace: TotalsEdgeTraceEntry[] = [];

  for (const item of parsed) {
    const gamePk = Number(item.gamePk);
    const game = gamesByPk.get(gamePk);
    if (!gamePk || !game) continue;

    const mlText = (
      item.moneylineRecommendation ??
      item.recommendation ??
      ""
    ).trim();

    const { analysis, traceEntry } = normalizeAnalysisWithTrace(game, mlText, item);
    trace.push(traceEntry);
    results.set(gamePk, analysis);
  }

  for (const game of games) {
    if (!results.has(game.gamePk)) {
      trace.push({
        gamePk: game.gamePk,
        away: game.away,
        home: game.home,
        source: "missing-from-response",
        rawTotalsStatEdge: null,
        rawTotalsPick: null,
        normalizedTotalsStatEdge: 0,
        normalizedTotalsPick: null,
        pickStrippedBelow7: false,
      });
      results.set(game.gamePk, fallbackAnalysis(game));
    }
  }

  logTotalsEdgeTrace(trace, {
    anthropicOutcome: parseFailed
      ? "json-parse-error"
      : parsed.length === 0
        ? "empty-response"
        : "ok",
    gamesRequested: games.length,
    parsedItems: parsed.length,
    responseChars: text.length,
    stopReason: data.stop_reason,
  });
  return results;
}

function formatRunLineForPrompt(game: GameForAnalysis): string {
  const away =
    game.awayRunLinePoint !== null
      ? `${game.away} ${formatRunLineSpread(game.awayRunLinePoint)} ${formatOdds(game.awayRunLinePrice)}`
      : null;
  const home =
    game.homeRunLinePoint !== null
      ? `${game.home} ${formatRunLineSpread(game.homeRunLinePoint)} ${formatOdds(game.homeRunLinePrice)}`
      : null;

  if (away && home) return `RL: ${away}, ${home}`;
  return "RL N/A";
}

function normalizeAnalysisWithTrace(
  game: GameForAnalysis,
  mlText: string,
  item: AiResponseItem
): { analysis: GameAnalysis; traceEntry: TotalsEdgeTraceEntry } {
  const rawTotalsStatEdge = item.totalsStatEdge;
  const rawTotalsPick = item.totalsPick ?? null;

  let totalsPick: "over" | "under" | null = null;
  if (item.totalsPick === "over" || item.totalsPick === "under") {
    totalsPick = item.totalsPick;
  }

  const moneylineRecommendation = PASS_PATTERN.test(mlText)
    ? fallbackMoneyline(game)
    : mlText;

  const moneylineStatEdge = clampEdge(item.moneylineStatEdge ?? 0);
  const totalsStatEdge = clampEdge(item.totalsStatEdge ?? 0);

  let totalsRecommendation =
    item.totalsRecommendation?.trim() || null;

  let pickStrippedBelow7 = false;
  if (totalsPick && totalsStatEdge < 7) {
    pickStrippedBelow7 = true;
    totalsPick = null;
    totalsRecommendation = null;
  }

  if (totalsPick && !totalsRecommendation && game.totalPoint !== null) {
    totalsRecommendation = `Take the ${totalsPick} ${game.totalPoint} with a ${totalsStatEdge}/10 statistical edge.`;
  }

  if (!totalsPick) {
    totalsRecommendation = null;
  }

  const runLine = normalizeRunLine(game, item);

  const analysis: GameAnalysis = {
    moneylineRecommendation,
    moneylineStatEdge,
    runLinePickSide: runLine.runLinePickSide,
    runLineRecommendation: runLine.runLineRecommendation,
    runLineStatEdge: runLine.runLineStatEdge,
    totalsPick,
    totalsRecommendation,
    totalsStatEdge,
  };

  const traceEntry: TotalsEdgeTraceEntry = {
    gamePk: game.gamePk,
    away: game.away,
    home: game.home,
    source: "ai",
    rawTotalsStatEdge,
    rawTotalsPick,
    normalizedTotalsStatEdge: totalsStatEdge,
    normalizedTotalsPick: totalsPick,
    pickStrippedBelow7,
  };

  return { analysis, traceEntry };
}

function normalizeAnalysis(
  game: GameForAnalysis,
  mlText: string,
  item: AiResponseItem
): GameAnalysis {
  return normalizeAnalysisWithTrace(game, mlText, item).analysis;
}

function normalizeRunLine(
  game: GameForAnalysis,
  item: AiResponseItem
): {
  runLinePickSide: "away" | "home" | null;
  runLineRecommendation: string | null;
  runLineStatEdge: number;
} {
  const runLineStatEdge = clampEdge(item.runLineStatEdge ?? 0);
  let runLinePickSide: "away" | "home" | null = null;
  if (item.runLinePickSide === "away" || item.runLinePickSide === "home") {
    runLinePickSide = item.runLinePickSide;
  }

  let runLineRecommendation = item.runLineRecommendation?.trim() || null;
  if (runLineRecommendation && PASS_PATTERN.test(runLineRecommendation)) {
    runLineRecommendation = null;
    runLinePickSide = null;
  }

  const parsed = parseAiRunLine({
    away: game.away,
    home: game.home,
    awayMoneyline: game.awayMoneyline,
    homeMoneyline: game.homeMoneyline,
    runLineRecommendation: runLineRecommendation ?? "",
    runLinePickSide,
    awayRunLinePoint: game.awayRunLinePoint,
    awayRunLinePrice: game.awayRunLinePrice,
    homeRunLinePoint: game.homeRunLinePoint,
    homeRunLinePrice: game.homeRunLinePrice,
  });

  if (!parsed) {
    return {
      runLinePickSide: null,
      runLineRecommendation: null,
      runLineStatEdge: 0,
    };
  }

  if (!runLinePickSide) {
    runLinePickSide = parsed.runLinePickSide;
  }

  if (!runLineRecommendation) {
    runLineRecommendation = `Take ${parsed.runLineTeam} ${formatRunLineSpread(parsed.runLineSpread)} (${formatOdds(parsed.runLineOdds)}) — ${runLineStatEdge}/10 run line edge.`;
  }

  return {
    runLinePickSide,
    runLineRecommendation,
    runLineStatEdge,
  };
}

function clampEdge(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(10, Math.round(n)));
}

function formatOdds(price: number | null): string {
  if (price === null) return "N/A";
  return price > 0 ? `+${price}` : `${price}`;
}

function fallbackMoneyline(game: GameForAnalysis): string {
  const pick = parseAiPick({
    away: game.away,
    home: game.home,
    awayMoneyline: game.awayMoneyline,
    homeMoneyline: game.homeMoneyline,
    recommendation: "",
  });

  if (pick.pickOdds === null) {
    return `Bet ${pick.pickTeam} on the moneyline at home.`;
  }

  return `Bet ${pick.pickTeam} ML ${formatOdds(pick.pickOdds)} — backing the market favorite.`;
}

function fallbackRunLine(game: GameForAnalysis): GameAnalysis["runLineRecommendation"] {
  const parsed = parseAiRunLine({
    away: game.away,
    home: game.home,
    awayMoneyline: game.awayMoneyline,
    homeMoneyline: game.homeMoneyline,
    runLineRecommendation: "",
    awayRunLinePoint: game.awayRunLinePoint,
    awayRunLinePrice: game.awayRunLinePrice,
    homeRunLinePoint: game.homeRunLinePoint,
    homeRunLinePrice: game.homeRunLinePrice,
  });

  if (!parsed) return null;

  return `Bet ${parsed.runLineTeam} ${formatRunLineSpread(parsed.runLineSpread)} ${formatOdds(parsed.runLineOdds)} — standard run line.`;
}

function fallbackAnalysis(game: GameForAnalysis): GameAnalysis {
  const runLineRecommendation = fallbackRunLine(game);
  const parsed = runLineRecommendation
    ? parseAiRunLine({
        away: game.away,
        home: game.home,
        awayMoneyline: game.awayMoneyline,
        homeMoneyline: game.homeMoneyline,
        runLineRecommendation,
        awayRunLinePoint: game.awayRunLinePoint,
        awayRunLinePrice: game.awayRunLinePrice,
        homeRunLinePoint: game.homeRunLinePoint,
        homeRunLinePrice: game.homeRunLinePrice,
      })
    : null;

  return {
    moneylineRecommendation: fallbackMoneyline(game),
    moneylineStatEdge:
      game.awayMoneyline !== null && game.homeMoneyline !== null ? 5 : 0,
    runLinePickSide: parsed?.runLinePickSide ?? null,
    runLineRecommendation,
    runLineStatEdge: parsed ? 5 : 0,
    totalsPick: null,
    totalsRecommendation: null,
    totalsStatEdge: 0,
  };
}
