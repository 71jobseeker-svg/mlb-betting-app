import { getFavoriteSide } from "@/lib/odds";

export type ParsedPick = {
  pickTeam: string;
  pickSide: "away" | "home";
  pickOdds: number | null;
};

export type ParsedRunLinePick = {
  runLineTeam: string;
  runLinePickSide: "away" | "home";
  runLineSpread: number;
  runLineOdds: number | null;
};

function teamMatchesRecommendation(
  recommendation: string,
  teamName: string
): boolean {
  const rec = recommendation.toLowerCase();
  const full = teamName.toLowerCase();
  const nickname = teamName.split(" ").pop()?.toLowerCase() ?? "";

  if (rec.includes(full)) return true;
  if (nickname.length >= 4 && rec.includes(nickname)) return true;
  return false;
}

export function parseAiPick(game: {
  away: string;
  home: string;
  awayMoneyline: number | null;
  homeMoneyline: number | null;
  recommendation: string;
}): ParsedPick {
  const awayMatch = teamMatchesRecommendation(game.recommendation, game.away);
  const homeMatch = teamMatchesRecommendation(game.recommendation, game.home);

  if (awayMatch && !homeMatch) {
    return {
      pickTeam: game.away,
      pickSide: "away",
      pickOdds: game.awayMoneyline,
    };
  }

  if (homeMatch && !awayMatch) {
    return {
      pickTeam: game.home,
      pickSide: "home",
      pickOdds: game.homeMoneyline,
    };
  }

  const favorite = getFavoriteSide(game.awayMoneyline, game.homeMoneyline);
  if (favorite === "away") {
    return {
      pickTeam: game.away,
      pickSide: "away",
      pickOdds: game.awayMoneyline,
    };
  }
  if (favorite === "home") {
    return {
      pickTeam: game.home,
      pickSide: "home",
      pickOdds: game.homeMoneyline,
    };
  }

  return {
    pickTeam: game.home,
    pickSide: "home",
    pickOdds: game.homeMoneyline,
  };
}

export function parseAiRunLine(game: {
  away: string;
  home: string;
  awayMoneyline: number | null;
  homeMoneyline: number | null;
  runLineRecommendation: string;
  runLinePickSide?: "away" | "home" | null;
  awayRunLinePoint: number | null;
  awayRunLinePrice: number | null;
  homeRunLinePoint: number | null;
  homeRunLinePrice: number | null;
}): ParsedRunLinePick | null {
  const hasAwayLine =
    game.awayRunLinePoint !== null && game.awayRunLinePrice !== null;
  const hasHomeLine =
    game.homeRunLinePoint !== null && game.homeRunLinePrice !== null;

  if (!hasAwayLine && !hasHomeLine) return null;

  if (game.runLinePickSide === "away" && hasAwayLine) {
    return {
      runLineTeam: game.away,
      runLinePickSide: "away",
      runLineSpread: game.awayRunLinePoint!,
      runLineOdds: game.awayRunLinePrice,
    };
  }

  if (game.runLinePickSide === "home" && hasHomeLine) {
    return {
      runLineTeam: game.home,
      runLinePickSide: "home",
      runLineSpread: game.homeRunLinePoint!,
      runLineOdds: game.homeRunLinePrice,
    };
  }

  const awayMatch = teamMatchesRecommendation(
    game.runLineRecommendation,
    game.away
  );
  const homeMatch = teamMatchesRecommendation(
    game.runLineRecommendation,
    game.home
  );

  if (awayMatch && !homeMatch && hasAwayLine) {
    return {
      runLineTeam: game.away,
      runLinePickSide: "away",
      runLineSpread: game.awayRunLinePoint!,
      runLineOdds: game.awayRunLinePrice,
    };
  }

  if (homeMatch && !awayMatch && hasHomeLine) {
    return {
      runLineTeam: game.home,
      runLinePickSide: "home",
      runLineSpread: game.homeRunLinePoint!,
      runLineOdds: game.homeRunLinePrice,
    };
  }

  const favorite = getFavoriteSide(game.awayMoneyline, game.homeMoneyline);
  if (favorite === "away" && hasAwayLine) {
    return {
      runLineTeam: game.away,
      runLinePickSide: "away",
      runLineSpread: game.awayRunLinePoint!,
      runLineOdds: game.awayRunLinePrice,
    };
  }
  if (favorite === "home" && hasHomeLine) {
    return {
      runLineTeam: game.home,
      runLinePickSide: "home",
      runLineSpread: game.homeRunLinePoint!,
      runLineOdds: game.homeRunLinePrice,
    };
  }

  if (hasAwayLine) {
    return {
      runLineTeam: game.away,
      runLinePickSide: "away",
      runLineSpread: game.awayRunLinePoint!,
      runLineOdds: game.awayRunLinePrice,
    };
  }

  if (hasHomeLine) {
    return {
      runLineTeam: game.home,
      runLinePickSide: "home",
      runLineSpread: game.homeRunLinePoint!,
      runLineOdds: game.homeRunLinePrice,
    };
  }

  return null;
}
