import { getFavoriteSide } from "@/lib/odds";

export type ParsedPick = {
  pickTeam: string;
  pickSide: "away" | "home";
  pickOdds: number | null;
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
