const TEAM_ALIASES: Record<string, string> = {
  "oakland athletics": "athletics",
};

export function normalizeTeamName(name: string): string {
  const key = name.trim().toLowerCase();
  return TEAM_ALIASES[key] ?? key;
}

export function teamsMatch(a: string, b: string): boolean {
  return normalizeTeamName(a) === normalizeTeamName(b);
}
