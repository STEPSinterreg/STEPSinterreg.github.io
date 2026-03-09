export type Ear = "L" | "R";
export type TrialStage = "coarse" | "fine";
export type YesNo = "yes" | "no";

export const R_APP_START_DBHL = 40;

export type RAppState = {
  suggestedDbHl: number;
  stage: TrialStage;
  /** YES counts at each presented level (keyed by the exact dB HL value). */
  yesCountsByLevel: Record<string, number>;
  lastResponse?: YesNo;
  /** Set when the stop criterion is reached. */
  complete: boolean;
  thresholdDbHl?: number;
};

export function createRAppState(startDbHl: number = R_APP_START_DBHL): RAppState {
  return {
    suggestedDbHl: startDbHl,
    stage: "coarse",
    yesCountsByLevel: {},
    complete: false,
  };
}

export type RAppTrialUpdate = {
  nextState: RAppState;
  stepApplied: -10 | 5;
  isReversal: boolean;
  thresholdReached: boolean;
};

/**
 * Deterministic R-App update rule:
 * - Start at 40 dB HL (per frequency/ear)
 * - After YES: 10 dB down
 * - After NO: 5 dB up
 * - Stop when YES has been recorded 3x at the same level
 */
export function applyRAppTrial(prev: RAppState, presentedDbHl: number, response: YesNo): RAppTrialUpdate {
  if (prev.complete) {
    return { nextState: prev, stepApplied: response === "yes" ? -10 : 5, isReversal: false, thresholdReached: true };
  }

  const isReversal = prev.lastResponse !== undefined && prev.lastResponse !== response;
  const stepApplied: -10 | 5 = response === "yes" ? -10 : 5;

  const yesCountsByLevel = { ...prev.yesCountsByLevel };
  let thresholdReached = false;
  let thresholdDbHl: number | undefined;

  if (response === "yes") {
    const key = String(presentedDbHl);
    const nextCount = (yesCountsByLevel[key] ?? 0) + 1;
    yesCountsByLevel[key] = nextCount;
    if (nextCount >= 3) {
      thresholdReached = true;
      thresholdDbHl = presentedDbHl;
    }
  }

  // Stage: coarse until the first sign we are near threshold.
  // We switch to fine after the first NO, or on any reversal.
  const nextStage: TrialStage = prev.stage === "coarse" && (response === "no" || isReversal) ? "fine" : prev.stage;

  const suggestedDbHl = thresholdReached ? presentedDbHl : presentedDbHl + stepApplied;

  const nextState: RAppState = {
    suggestedDbHl,
    stage: nextStage,
    yesCountsByLevel,
    lastResponse: response,
    complete: thresholdReached,
    thresholdDbHl,
  };

  return { nextState, stepApplied, isReversal, thresholdReached };
}
