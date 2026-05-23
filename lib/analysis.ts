import { parseAiPick } from "@/lib/picks";

export type GameForAnalysis = {
  gamePk: number;
  away: string;
  home: string;
  status: string;
  startTime: string;
  awayMoneyline: number | null;
  homeMoneyline: number | null;
  totalPoint: number | null;
  overPrice: number | null;
  underPrice: number | null;
};

export type GameAnalysis = {
  moneylineRecommendation: string;
  /** AI confidence / edge for moneyline (0–10). */
  moneylineStatEdge: number;
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
  totalsPick?: "over" | "under" | null;
  totalsRecommendation?: string | null;
  totalsStatEdge?: number;
};

const PASS_PATTERN =
  /\bpass\b|no\s+(clear\s+)?edge|no\s+bet|skip|stay\s+away|avoid\s+betting/i;

export async function generateBettingRecommendations(
  games: GameForAnalysis[]
): Promise<Map<number, GameAnalysis>> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const results = new Map<number, GameAnalysis>();

  if (!apiKey) {
    for (const game of games) {
      results.set(game.gamePk, fallbackAnalysis(game));
    }
    return results;
  }

  if (games.length === 0) return results;

  const prompt = `You are an MLB betting analyst. For EVERY game provide a moneyline pick AND evaluate the total (over/under).

Rules:
- Moneyline: ALWAYS pick one team. Never pass. One sentence, cite American odds.
- moneylineStatEdge: integer 0-10 (your confidence/statistical edge on the ML pick; 10=maximum).
- Totals: Only recommend Over or Under if you see a real statistical edge (line value, pitching, weather, park factors). Otherwise set totalsPick to null and totalsStatEdge to 0.
- totalsStatEdge: integer 0-10 (0=no edge, 7+=strong edge worth a best bet, 10=maximum confidence). Only use 7+ when you genuinely favor the total bet.
- totalsRecommendation: one sentence explaining the O/U pick, or null if no edge.
- Return ONLY valid JSON array:
[{"gamePk":number,"moneylineRecommendation":"...","moneylineStatEdge":number,"totalsPick":"over"|"under"|null,"totalsRecommendation":"..."|null,"totalsStatEdge":number}]

Games:
${games
  .map((g) => {
    const ou =
      g.totalPoint !== null
        ? `O/U ${g.totalPoint} (O ${formatOdds(g.overPrice)} / U ${formatOdds(g.underPrice)})`
        : "O/U N/A";
    return `- gamePk ${g.gamePk}: ${g.away} @ ${g.home} | ${g.startTime} | ${g.status} | ML: ${g.away} ${formatOdds(g.awayMoneyline)}, ${g.home} ${formatOdds(g.homeMoneyline)} | ${ou}`;
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
    for (const game of games) {
      results.set(game.gamePk, fallbackAnalysis(game));
    }
    return results;
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };

  const text = data.content?.find((c) => c.type === "text")?.text ?? "[]";
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  let parsed: AiResponseItem[] = [];

  try {
    parsed = JSON.parse(jsonMatch?.[0] ?? "[]") as AiResponseItem[];
  } catch {
    console.error("Failed to parse Anthropic JSON:", text.slice(0, 500));
  }

  const gamesByPk = new Map(games.map((g) => [g.gamePk, g]));

  for (const item of parsed) {
    const gamePk = Number(item.gamePk);
    const game = gamesByPk.get(gamePk);
    if (!gamePk || !game) continue;

    const mlText = (
      item.moneylineRecommendation ??
      item.recommendation ??
      ""
    ).trim();

    results.set(gamePk, normalizeAnalysis(game, mlText, item));
  }

  for (const game of games) {
    if (!results.has(game.gamePk)) {
      results.set(game.gamePk, fallbackAnalysis(game));
    }
  }

  return results;
}

function normalizeAnalysis(
  game: GameForAnalysis,
  mlText: string,
  item: AiResponseItem
): GameAnalysis {
  const moneylineRecommendation = PASS_PATTERN.test(mlText)
    ? fallbackMoneyline(game)
    : mlText;

  let totalsPick: "over" | "under" | null = null;
  if (item.totalsPick === "over" || item.totalsPick === "under") {
    totalsPick = item.totalsPick;
  }

  const moneylineStatEdge = clampEdge(item.moneylineStatEdge ?? 0);
  const totalsStatEdge = clampEdge(item.totalsStatEdge ?? 0);

  let totalsRecommendation =
    item.totalsRecommendation?.trim() || null;

  if (totalsPick && totalsStatEdge < 7) {
    totalsPick = null;
    totalsRecommendation = null;
  }

  if (totalsPick && !totalsRecommendation && game.totalPoint !== null) {
    totalsRecommendation = `Take the ${totalsPick} ${game.totalPoint} with a ${totalsStatEdge}/10 statistical edge.`;
  }

  if (!totalsPick) {
    totalsRecommendation = null;
  }

  return {
    moneylineRecommendation,
    moneylineStatEdge,
    totalsPick,
    totalsRecommendation,
    totalsStatEdge: totalsPick ? totalsStatEdge : 0,
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

function fallbackAnalysis(game: GameForAnalysis): GameAnalysis {
  return {
    moneylineRecommendation: fallbackMoneyline(game),
    moneylineStatEdge: game.awayMoneyline !== null && game.homeMoneyline !== null ? 5 : 0,
    totalsPick: null,
    totalsRecommendation: null,
    totalsStatEdge: 0,
  };
}
