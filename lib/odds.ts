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
    throw new Error("ODDS_API_KEY is not set in .env.local");
  }

  const url = new URL(`${ODDS_API_BASE}/sports/baseball_mlb/odds`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("regions", "us");
  url.searchParams.set("markets", "h2h,totals");
  url.searchParams.set("oddsFormat", "american");

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Odds API failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as OddsApiEvent[] | { message?: string };
  if (!Array.isArray(data)) {
    throw new Error(data.message ?? "Unexpected odds API response");
  }

  return data;
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
  const bookmaker = event.bookmakers?.[0];
  const market = bookmaker?.markets?.find((m) => m.key === "h2h");
  const outcomes = market?.outcomes ?? [];

  const awayOutcome = outcomes.find((o) => teamsMatch(o.name, awayTeam));
  const homeOutcome = outcomes.find((o) => teamsMatch(o.name, homeTeam));

  return {
    awayMoneyline: awayOutcome?.price ?? null,
    homeMoneyline: homeOutcome?.price ?? null,
    bookmaker: bookmaker?.title ?? null,
  };
}

export type TotalLine = {
  point: number | null;
  overPrice: number | null;
  underPrice: number | null;
};

export function extractTotalLine(event: OddsApiEvent): TotalLine {
  const bookmaker = event.bookmakers?.[0];
  const market = bookmaker?.markets?.find((m) => m.key === "totals");
  const outcomes = market?.outcomes ?? [];

  const over = outcomes.find((o) => o.name === "Over");
  const under = outcomes.find((o) => o.name === "Under");

  return {
    point: over?.point ?? under?.point ?? null,
    overPrice: over?.price ?? null,
    underPrice: under?.price ?? null,
  };
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
