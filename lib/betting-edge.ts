/** Minimum displayed confidence (0–10) for any Best Bet slot. */
export const MIN_BEST_BET_CONFIDENCE = 4;

export const MIN_BEST_BET_SCORE = MIN_BEST_BET_CONFIDENCE / 10;

/** Convert American odds to implied win probability (0–1). */
export function americanToImpliedProbability(american: number): number {
  if (american > 0) return 100 / (american + 100);
  return Math.abs(american) / (Math.abs(american) + 100);
}

/** Decimal payout multiplier (stake + profit per $1). */
export function americanToDecimal(american: number): number {
  if (american > 0) return 1 + american / 100;
  return 1 + 100 / Math.abs(american);
}

/** Expected value as a fraction of stake (0.05 = +5% EV). */
export function calculateEv(modelWinProb: number, americanOdds: number): number {
  const decimal = americanToDecimal(americanOdds);
  return modelWinProb * decimal - 1;
}

function vigFreeProbability(
  sideOdds: number,
  opponentOdds: number
): number {
  const side = americanToImpliedProbability(sideOdds);
  const opponent = americanToImpliedProbability(opponentOdds);
  const total = side + opponent;
  if (total <= 0) return 0.5;
  return side / total;
}

/**
 * Model win probability for a side given AI ML pick + edge on that pick.
 */
export function estimateModelWinProbability(
  sideOdds: number,
  opponentOdds: number,
  aiPickSide: "away" | "home",
  targetSide: "away" | "home",
  moneylineStatEdge: number
): number {
  const edgeFactor = Math.max(0, Math.min(10, moneylineStatEdge)) / 10;
  const sideVigFree = vigFreeProbability(sideOdds, opponentOdds);
  const opponentVigFree = vigFreeProbability(opponentOdds, sideOdds);

  if (aiPickSide === targetSide) {
    return Math.min(0.95, sideVigFree + edgeFactor * 0.12);
  }

  const modelOpponentProb = Math.min(0.95, opponentVigFree + edgeFactor * 0.12);
  return Math.max(0.05, 1 - modelOpponentProb);
}

/**
 * Map EV (fraction of stake) to a 0–10 confidence score.
 * Examples: 0% EV → floor (4), 4% EV → ~6, 8% EV → ~8.
 */
export function evToConfidence(ev: number): number {
  if (ev <= 0) return MIN_BEST_BET_CONFIDENCE;
  const raw = MIN_BEST_BET_CONFIDENCE + ev * 50;
  return Math.min(10, Math.round(raw * 10) / 10);
}

export function applyConfidenceFloor(confidence: number): number {
  return Math.max(
    MIN_BEST_BET_CONFIDENCE,
    Math.min(10, Math.round(confidence * 10) / 10)
  );
}

export function confidenceToScore(confidence: number): number {
  return applyConfidenceFloor(confidence) / 10;
}

/**
 * EV-based moneyline confidence for a specific side (favorite or underdog bucket).
 */
export function calculateEdge(
  betOdds: number,
  opponentOdds: number,
  aiPickSide: "away" | "home",
  targetSide: "away" | "home",
  moneylineStatEdge: number
): number {
  const modelProb = estimateModelWinProbability(
    betOdds,
    opponentOdds,
    aiPickSide,
    targetSide,
    moneylineStatEdge
  );
  const ev = calculateEv(modelProb, betOdds);
  return applyConfidenceFloor(evToConfidence(ev));
}

/**
 * EV-based O/U confidence for a specific side (over/under).
 */
export function calculateTotalsEdge(
  americanOdds: number,
  aiTotalsStatEdge: number,
  aiTotalsPick: "over" | "under" | null,
  targetPick: "over" | "under"
): number {
  const implied = americanToImpliedProbability(americanOdds);
  let edgeFactor = Math.max(0, Math.min(10, aiTotalsStatEdge)) / 10;

  if (aiTotalsPick != null && aiTotalsPick !== targetPick) {
    const modelProb = Math.max(0.05, implied * 0.92);
    return applyConfidenceFloor(evToConfidence(calculateEv(modelProb, americanOdds)));
  }

  if (aiTotalsPick == null) {
    edgeFactor *= 0.65;
  }

  const modelProb = Math.min(0.95, implied + edgeFactor * 0.12);
  return applyConfidenceFloor(evToConfidence(calculateEv(modelProb, americanOdds)));
}
