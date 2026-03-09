export type TransducerType = "air";

export const AUDIOGRAM_FREQUENCIES_HZ = [
  250, 500, 1000, 2000, 3000, 4000, 6000, 8000,
] as const;

export type AudiogramFrequencyHz = (typeof AUDIOGRAM_FREQUENCIES_HZ)[number];

export type CalibrationProfile = {
  id: string;
  name: string;
  transducer: TransducerType;
  /** Optional metadata shown in exports */
  deviceLabel?: string;
  /**
   * Per-frequency maximum deliverable level (in dB HL) when volume scalar = 1.0.
   * Used by: volume = 10^((dBIntended - dBFrequencyMax)/20)
   */
  dBFrequencyMaxByHz: Record<number, number>;
  /**
   * Optional per-frequency minimum intended level (in dB HL) allowed for testing.
   * If omitted, we use (max - 80).
   */
  dBFrequencyMinByHz?: Record<number, number>;
};

export type DbhlRange = { minDbHl: number; maxDbHl: number };

export function getDbhlRangeForFrequency(profile: CalibrationProfile, frequencyHz: number): DbhlRange {
  const maxDbHl = profile.dBFrequencyMaxByHz[frequencyHz];
  if (typeof maxDbHl !== "number" || Number.isNaN(maxDbHl)) {
    throw new Error(`Missing dBFrequencyMax for ${frequencyHz} Hz in calibration profile ${profile.id}`);
  }
  const minFromProfile = profile.dBFrequencyMinByHz?.[frequencyHz];
  const minDbHl = typeof minFromProfile === "number" && !Number.isNaN(minFromProfile) ? minFromProfile : maxDbHl - 80;
  return { minDbHl, maxDbHl };
}

export type DbhlToVolumeResult =
  | { ok: true; volume: number }
  | { ok: false; outOfRange: "floor" | "ceiling"; minDbHl: number; maxDbHl: number };

export function dbhlToVolumeScalar(profile: CalibrationProfile, frequencyHz: number, dbIntended: number): DbhlToVolumeResult {
  const { minDbHl, maxDbHl } = getDbhlRangeForFrequency(profile, frequencyHz);
  if (dbIntended < minDbHl) return { ok: false, outOfRange: "floor", minDbHl, maxDbHl };
  if (dbIntended > maxDbHl) return { ok: false, outOfRange: "ceiling", minDbHl, maxDbHl };

  // volume = 10^((dBIntended - dBFrequencyMax)/20)
  const volume = Math.pow(10, (dbIntended - maxDbHl) / 20);
  return { ok: true, volume };
}

/**
 * Prototype/default calibration profile.
 * These values should be replaced by a real device/headphone calibration.
 */
export const defaultCalibrationProfile: CalibrationProfile = {
  id: "default-prototype",
  name: "Default (prototype)",
  transducer: "air",
  deviceLabel: "Uncalibrated",
  // Allow typical clinical range for prototyping.
  dBFrequencyMaxByHz: {
    250: 100,
    500: 100,
    1000: 100,
    2000: 100,
    3000: 100,
    4000: 100,
    6000: 100,
    8000: 100,
  },
  dBFrequencyMinByHz: {
    250: -10,
    500: -10,
    1000: -10,
    2000: -10,
    3000: -10,
    4000: -10,
    6000: -10,
    8000: -10,
  },
};
