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

export type TotalLine = {
  point: number | null;
  overPrice: number | null;
  underPrice: number | null;
};

export type RunLineOdds = {
  awayRunLinePoint: number | null;
  awayRunLinePrice: number | null;
  homeRunLinePoint: number | null;
  homeRunLinePrice: number | null;
};

export type GameOdds = MoneylineOdds & RunLineOdds & TotalLine;

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
    url.searchParams.set("markets", "h2h,totals,spreads");
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
  return extractGameOdds(event, awayTeam, homeTeam);
}

type MarketOutcome = { name: string; price: number; point?: number };

function findTeamOutcome(
  outcomes: MarketOutcome[],
  mlbName: string,
  eventName: string
): MarketOutcome | undefined {
  return outcomes.find(
    (o) => teamsMatch(o.name, mlbName) || teamsMatch(o.name, eventName)
  );
}

function parseH2h(
  market: { outcomes?: MarketOutcome[] } | undefined,
  awayTeam: string,
  homeTeam: string,
  eventAway: string,
  eventHome: string
): { away: number; home: number } | null {
  const outcomes = market?.outcomes ?? [];
  const awayOutcome = findTeamOutcome(outcomes, awayTeam, eventAway);
  const homeOutcome = findTeamOutcome(outcomes, homeTeam, eventHome);
  if (awayOutcome?.price == null || homeOutcome?.price == null) return null;
  return { away: awayOutcome.price, home: homeOutcome.price };
}

function parseSpreads(
  market: { outcomes?: MarketOutcome[] } | undefined,
  awayTeam: string,
  homeTeam: string,
  eventAway: string,
  eventHome: string
): RunLineOdds | null {
  const outcomes = market?.outcomes ?? [];
  const awayOutcome = findTeamOutcome(outcomes, awayTeam, eventAway);
  const homeOutcome = findTeamOutcome(outcomes, homeTeam, eventHome);

  if (
    awayOutcome?.price == null ||
    awayOutcome.point == null ||
    homeOutcome?.price == null ||
    homeOutcome.point == null
  ) {
    return null;
  }

  return {
    awayRunLinePoint: awayOutcome.point,
    awayRunLinePrice: awayOutcome.price,
    homeRunLinePoint: homeOutcome.point,
    homeRunLinePrice: homeOutcome.price,
  };
}

function parseTotals(
  market: { outcomes?: MarketOutcome[] } | undefined
): TotalLine | null {
  const outcomes = market?.outcomes ?? [];
  const over = outcomes.find((o) => o.name === "Over");
  const under = outcomes.find((o) => o.name === "Under");
  const point = over?.point ?? under?.point ?? null;

  if (point === null || over?.price == null || under?.price == null) {
    return null;
  }

  return { point, overPrice: over.price, underPrice: under.price };
}

const EMPTY_GAME_ODDS: GameOdds = {
  awayMoneyline: null,
  homeMoneyline: null,
  bookmaker: null,
  awayRunLinePoint: null,
  awayRunLinePrice: null,
  homeRunLinePoint: null,
  homeRunLinePrice: null,
  point: null,
  overPrice: null,
  underPrice: null,
};

function oddsCompleteness(
  spreads: RunLineOdds | null,
  totals: TotalLine | null
): number {
  let score = 1;
  if (totals) score += 4;
  if (spreads) score += 2;
  return score;
}

function findTotalsFromAnyBookmaker(
  event: OddsApiEvent
): TotalLine | null {
  for (const bookmaker of event.bookmakers ?? []) {
    const totals = parseTotals(
      bookmaker.markets?.find((m) => m.key === "totals")
    );
    if (totals) return totals;
  }
  return null;
}

function findSpreadsFromAnyBookmaker(
  event: OddsApiEvent,
  awayTeam: string,
  homeTeam: string
): RunLineOdds | null {
  const eventAway = event.away_team;
  const eventHome = event.home_team;

  for (const bookmaker of event.bookmakers ?? []) {
    const spreads = parseSpreads(
      bookmaker.markets?.find((m) => m.key === "spreads"),
      awayTeam,
      homeTeam,
      eventAway,
      eventHome
    );
    if (spreads) return spreads;
  }
  return null;
}

/** Prefer one bookmaker with all markets; backfill totals/spreads independently when needed. */
export function extractGameOdds(
  event: OddsApiEvent,
  awayTeam: string,
  homeTeam: string,
  gameId?: number
): GameOdds {
  const eventAway = event.away_team;
  const eventHome = event.home_team;

  let best: GameOdds | null = null;
  let bestScore = -1;

  for (const bookmaker of event.bookmakers ?? []) {
    const h2h = parseH2h(
      bookmaker.markets?.find((m) => m.key === "h2h"),
      awayTeam,
      homeTeam,
      eventAway,
      eventHome
    );
    if (!h2h) continue;

    const spreads = parseSpreads(
      bookmaker.markets?.find((m) => m.key === "spreads"),
      awayTeam,
      homeTeam,
      eventAway,
      eventHome
    );
    const totals = parseTotals(bookmaker.markets?.find((m) => m.key === "totals"));

    const odds: GameOdds = {
      awayMoneyline: h2h.away,
      homeMoneyline: h2h.home,
      bookmaker: bookmaker.title ?? null,
      awayRunLinePoint: spreads?.awayRunLinePoint ?? null,
      awayRunLinePrice: spreads?.awayRunLinePrice ?? null,
      homeRunLinePoint: spreads?.homeRunLinePoint ?? null,
      homeRunLinePrice: spreads?.homeRunLinePrice ?? null,
      point: totals?.point ?? null,
      overPrice: totals?.overPrice ?? null,
      underPrice: totals?.underPrice ?? null,
    };

    const score = oddsCompleteness(spreads, totals);
    if (score > bestScore) {
      best = odds;
      bestScore = score;
    }

    if (spreads && totals) return odds;
  }

  if (!best) return EMPTY_GAME_ODDS;

  if (best.point === null) {
    const totals = findTotalsFromAnyBookmaker(event);
    if (totals) {
      best = {
        ...best,
        point: totals.point,
        overPrice: totals.overPrice,
        underPrice: totals.underPrice,
      };
    }
  }

  if (best.awayRunLinePoint === null) {
    const spreads = findSpreadsFromAnyBookmaker(event, awayTeam, homeTeam);
    if (spreads) {
      best = {
        ...best,
        awayRunLinePoint: spreads.awayRunLinePoint,
        awayRunLinePrice: spreads.awayRunLinePrice,
        homeRunLinePoint: spreads.homeRunLinePoint,
        homeRunLinePrice: spreads.homeRunLinePrice,
      };
    }
  }

  const totalLine: TotalLine = {
    point: best.point,
    overPrice: best.overPrice,
    underPrice: best.underPrice,
  };
  console.warn(
    "[Odds] game:",
    gameId ?? event.id,
    "totalLine:",
    totalLine
  );

  return best;
}

export function extractRunLines(
  event: OddsApiEvent,
  awayTeam: string,
  homeTeam: string
): RunLineOdds {
  const odds = extractGameOdds(event, awayTeam, homeTeam);
  return {
    awayRunLinePoint: odds.awayRunLinePoint,
    awayRunLinePrice: odds.awayRunLinePrice,
    homeRunLinePoint: odds.homeRunLinePoint,
    homeRunLinePrice: odds.homeRunLinePrice,
  };
}

export function formatRunLineSpread(point: number): string {
  return point > 0 ? `+${point}` : `${point}`;
}

export function extractTotalLine(
  event: OddsApiEvent,
  awayTeam?: string,
  homeTeam?: string
): TotalLine {
  if (awayTeam && homeTeam) {
    const odds = extractGameOdds(event, awayTeam, homeTeam);
    return {
      point: odds.point,
      overPrice: odds.overPrice,
      underPrice: odds.underPrice,
    };
  }

  for (const bookmaker of event.bookmakers ?? []) {
    const totals = parseTotals(bookmaker.markets?.find((m) => m.key === "totals"));
    if (totals) return totals;
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
