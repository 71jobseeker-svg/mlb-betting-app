const TEAM_ALIASES: Record<string, string> = {
  "oakland athletics": "athletics",
  athletics: "oakland athletics",
};

export function normalizeTeamName(name: string): string {
  const key = name.trim().toLowerCase();
  return TEAM_ALIASES[key] ?? key;
}

function nickname(name: string): string {
  const parts = normalizeTeamName(name).split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] ?? name;
}

/** Match MLB schedule names to Odds API names (e.g. "Arizona Diamondbacks" vs "Diamondbacks"). */
export function teamsMatch(a: string, b: string): boolean {
  const na = normalizeTeamName(a);
  const nb = normalizeTeamName(b);
  if (na === nb) return true;
  if (nickname(a) === nickname(b)) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  return false;
}
