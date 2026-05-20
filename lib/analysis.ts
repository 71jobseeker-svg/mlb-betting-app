export type GameForAnalysis = {
  gamePk: number;
  away: string;
  home: string;
  status: string;
  awayMoneyline: number | null;
  homeMoneyline: number | null;
};

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

type RecommendationResult = {
  gamePk: number;
  recommendation: string;
};

export async function generateBettingRecommendations(
  games: GameForAnalysis[]
): Promise<Map<number, string>> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const results = new Map<number, string>();

  if (!apiKey) {
    for (const game of games) {
      results.set(
        game.gamePk,
        "Add ANTHROPIC_API_KEY to .env.local to enable AI recommendations."
      );
    }
    return results;
  }

  if (games.length === 0) return results;

  const prompt = `You are an MLB moneyline betting analyst. For EVERY game below you MUST pick exactly one team to bet on the moneyline.

Rules:
- NEVER say pass, skip, no bet, or "no clear edge" — always commit to a side.
- Name the team you are backing and cite their American odds (e.g. "Bet the Marlins ML at -280").
- Use the listed moneyline odds to justify your pick — favorite or underdog is fine.
- One sentence per game, max 30 words.
- Return ONLY valid JSON: [{"gamePk":number,"recommendation":"..."}]

Games:
${games
  .map(
    (g) =>
      `- gamePk ${g.gamePk}: ${g.away} @ ${g.home} (${g.status}) | ML: ${g.away} ${formatOdds(g.awayMoneyline)}, ${g.home} ${formatOdds(g.homeMoneyline)}`
  )
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
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const err = await res.text();
    const message =
      res.status === 401
        ? "Invalid ANTHROPIC_API_KEY — check the key at console.anthropic.com and restart the dev server."
        : `Anthropic API error (${res.status}). Try again shortly.`;

    console.error("Anthropic API failed:", res.status, err);

    for (const game of games) {
      results.set(game.gamePk, message);
    }
    return results;
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };

  const text = data.content?.find((c) => c.type === "text")?.text ?? "[]";
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  let parsed: RecommendationResult[] = [];

  try {
    parsed = JSON.parse(jsonMatch?.[0] ?? "[]") as RecommendationResult[];
  } catch {
    console.error("Failed to parse Anthropic JSON:", text.slice(0, 500));
  }

  const gamesByPk = new Map(games.map((g) => [g.gamePk, g]));

  for (const item of parsed) {
    const gamePk = Number(item.gamePk);
    const game = gamesByPk.get(gamePk);
    if (gamePk && item.recommendation && game) {
      results.set(gamePk, ensurePick(item.recommendation.trim(), game));
    }
  }

  for (const game of games) {
    if (!results.has(game.gamePk)) {
      results.set(game.gamePk, fallbackPick(game));
    }
  }

  return results;
}

function formatOdds(price: number | null): string {
  if (price === null) return "N/A";
  return price > 0 ? `+${price}` : `${price}`;
}

const PASS_PATTERN =
  /\bpass\b|no\s+(clear\s+)?edge|no\s+bet|skip|stay\s+away|avoid\s+betting/i;

function ensurePick(recommendation: string, game: GameForAnalysis): string {
  if (!PASS_PATTERN.test(recommendation)) return recommendation;
  return fallbackPick(game);
}

function fallbackPick(game: GameForAnalysis): string {
  const { away, home, awayMoneyline, homeMoneyline } = game;

  if (awayMoneyline === null || homeMoneyline === null) {
    return `Bet ${home} on the moneyline at home.`;
  }

  const awayIsFavorite = awayMoneyline < homeMoneyline;
  const pick = awayIsFavorite ? away : home;
  const odds = awayIsFavorite ? awayMoneyline : homeMoneyline;

  return `Bet ${pick} ML ${formatOdds(odds)} — backing the market favorite based on the current line.`;
}
