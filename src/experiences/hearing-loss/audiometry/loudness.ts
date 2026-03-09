// The test UX records one slider selection per measurement.
// We keep a stage field only for backwards compatibility in recorded trials.
export type LoudnessStage = "single";
export type YesNo = "yes" | "no";

export const LOUDNESS_MIN_LEVEL = 1;
export const LOUDNESS_MAX_LEVEL = 100;
export const LOUDNESS_START_LEVEL = 50;

// Loudness mapping is intentionally "non-diagnostic".
// We still want low slider values to be close to inaudible on typical consumer earbuds.
export const LOUDNESS_MIN_DB = -80;
export const LOUDNESS_MAX_DB = 0;

export function clampLevel(level: number): number {
  // Integer levels only (1–100).
  const rounded = Math.round(level);
  return Math.max(LOUDNESS_MIN_LEVEL, Math.min(LOUDNESS_MAX_LEVEL, rounded));
}

/**
 * Map discrete levels 1..100 to a relative attenuation in dB.
 * Level 1 = -80 dB, Level 100 = 0 dB.
 */
export function levelToDb(level: number): number {
  const lvl = clampLevel(level);
  const span = LOUDNESS_MAX_DB - LOUDNESS_MIN_DB;
  return LOUDNESS_MIN_DB + (lvl - 1) * (span / 99);
}

/**
 * Approximate normal-hearing relative sensitivity by frequency.
 * Negative values mean "harder to hear" at the same slider level.
 * This is a small psychoacoustic nudge (not calibration; not diagnostic).
 */
const NORMAL_HEARING_RELATIVE_DB_BY_HZ: Record<number, number> = {
  250: -12,
  500: -6,
  1000: 0,
  2000: 0,
  3000: 0,
  4000: 0,
  6000: -1,
  8000: -3,
};

export function relativeSensitivityDbForFrequency(frequencyHz: number): number {
  const key = Math.round(frequencyHz);
  return NORMAL_HEARING_RELATIVE_DB_BY_HZ[key] ?? 0;
}

/**
 * Convert a level to linear gain, with a conservative cap for safety.
 */
export function levelToGain(level: number, maxGain: number = 0.5): number {
  const db = levelToDb(level);
  const linear = Math.pow(10, db / 20);
  return Math.max(0, Math.min(1, linear)) * Math.max(0, Math.min(1, maxGain));
}

/**
 * Convert a level to linear gain for a specific frequency.
 * Uses the same overall mapping as levelToGain, but applies a small frequency-dependent adjustment.
 */
export function levelToGainForFrequency(level: number, frequencyHz: number, maxGain: number = 0.5): number {
  const db = levelToDb(level) + relativeSensitivityDbForFrequency(frequencyHz);
  const linear = Math.pow(10, db / 20);
  return Math.max(0, Math.min(1, linear)) * Math.max(0, Math.min(1, maxGain));
}
