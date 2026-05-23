import { teamsMatch } from "@/lib/teams";

const ODDS_API_BASE = "https://api.the-odds-api.com/v4";

export type OddsApiEvent = {
  id: string;
  home_team: string;
  away_team: string;
  bookmakers?: Array<{
    key: string;
    title: string;
    markets?: Array<{
      key: string;
      outcomes?: Array<{ name: string; price: number; point?: number }>;
    }>;
  }>;
};

export type MoneylineOdds = {
  awayMoneyline: number | null;
  homeMoneyline: number | null;
  bookmaker: string | null;
};

export type FavoriteSide = "away" | "home" | "pick";

export async function fetchMlbMoneylineOdds(): Promise<OddsApiEvent[]> {
  const apiKey = process.env.ODDS_API_KEY?.trim();
  if (!apiKey) {
    console.error("ODDS_API_KEY is not configured");
    return [];
  }

  try {
    const url = new URL(`${ODDS_API_BASE}/sports/baseball_mlb/odds`);
    url.searchParams.set("apiKey", apiKey);
    url.searchParams.set("regions", "us");
    url.searchParams.set("markets", "h2h,totals");
    url.searchParams.set("oddsFormat", "american");

    const res = await fetch(url.toString(), { cache: "no-store" });
    const remaining = res.headers.get("x-requests-remaining");
    if (remaining !== null) {
      console.log(`[Odds API] requests remaining: ${remaining}`);
    }

    if (!res.ok) {
      let detail = res.statusText;
      try {
        const err = (await res.json()) as { message?: string };
        if (err.message) detail = err.message;
      } catch {
        // non-JSON error body
      }
      if (res.status === 401) {
        console.error(
          "[Odds API] ODDS_API_KEY is invalid or expired (401). Update .env.local and your host env (e.g. Vercel)."
        );
      }
      console.error(`Odds API failed: ${res.status} ${detail}`);
      return [];
    }

    const data = (await res.json()) as OddsApiEvent[] | { message?: string };
    if (!Array.isArray(data)) {
      console.error("Unexpected odds API response:", data);
      return [];
    }

    return data;
  } catch (error) {
    console.error("Odds API request error:", error);
    return [];
  }
}

export function findOddsForMatchup(
  events: OddsApiEvent[],
  awayTeam: string,
  homeTeam: string
): OddsApiEvent | undefined {
  return events.find(
    (event) =>
      teamsMatch(event.away_team, awayTeam) && teamsMatch(event.home_team, homeTeam)
  );
}

export function extractMoneyline(
  event: OddsApiEvent,
  awayTeam: string,
  homeTeam: string
): MoneylineOdds {
  for (const bookmaker of event.bookmakers ?? []) {
    const market = bookmaker.markets?.find((m) => m.key === "h2h");
    const outcomes = market?.outcomes ?? [];
    const awayOutcome = outcomes.find((o) => teamsMatch(o.name, awayTeam));
    const homeOutcome = outcomes.find((o) => teamsMatch(o.name, homeTeam));

    if (awayOutcome?.price != null && homeOutcome?.price != null) {
      return {
        awayMoneyline: awayOutcome.price,
        homeMoneyline: homeOutcome.price,
        bookmaker: bookmaker.title ?? null,
      };
    }
  }

  return {
    awayMoneyline: null,
    homeMoneyline: null,
    bookmaker: null,
  };
}

export type TotalLine = {
  point: number | null;
  overPrice: number | null;
  underPrice: number | null;
};

export function extractTotalLine(event: OddsApiEvent): TotalLine {
  for (const bookmaker of event.bookmakers ?? []) {
    const market = bookmaker.markets?.find((m) => m.key === "totals");
    const outcomes = market?.outcomes ?? [];
    const over = outcomes.find((o) => o.name === "Over");
    const under = outcomes.find((o) => o.name === "Under");
    const point = over?.point ?? under?.point ?? null;

    if (point !== null && over?.price != null && under?.price != null) {
      return {
        point,
        overPrice: over.price,
        underPrice: under.price,
      };
    }
  }

  return { point: null, overPrice: null, underPrice: null };
}

export function formatAmericanOdds(price: number | null): string {
  if (price === null) return "—";
  return price > 0 ? `+${price}` : `${price}`;
}

export function getFavoriteSide(
  awayMoneyline: number | null,
  homeMoneyline: number | null
): FavoriteSide {
  if (awayMoneyline === null || homeMoneyline === null) return "pick";
  if (awayMoneyline < homeMoneyline) return "away";
  if (homeMoneyline < awayMoneyline) return "home";
  return "pick";
}
