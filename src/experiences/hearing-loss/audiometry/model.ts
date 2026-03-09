import type { CalibrationProfile } from "../../../audio/calibration";
import type { Ear } from "./rapp";
import type { LoudnessStage, YesNo } from "./loudness";

export type AudiometryTrial = {
  frequency_hz: number;
  level: number;
  gain: number;
  response_yesno: YesNo;
  stage: LoudnessStage;
  timestamp: number;
};

export type AudiometryFlags = {
  hit_floor: boolean;
  hit_ceiling: boolean;
  incomplete: boolean;
  reliability_score?: number;
};

export type EarAudiogram = {
  ear: Ear;
  transducer: "air";
  /** Loudness Level (1–100). undefined = not tested yet, null = not detected at max / invalid */
  thresholds_by_hz: Record<number, number | null | undefined>;
  trials: AudiometryTrial[];
  flags: AudiometryFlags;
};

export type AudiometrySession = {
  session_id: string;
  subject_id?: string;
  started_at: number;
  calibration_profile_id: string;
  device_label?: string;
  transducer: "air";
  left: EarAudiogram;
  right: EarAudiogram;
};

function createEmptyThresholds(frequenciesHz: readonly number[]): Record<number, number | null | undefined> {
  const out: Record<number, number | null | undefined> = {};
  for (const f of frequenciesHz) out[f] = undefined;
  return out;
}

export function createAudiometrySession(
  frequenciesHz: readonly number[],
  calibration: CalibrationProfile,
  opts?: { subjectId?: string }
): AudiometrySession {
  const session_id =
    typeof crypto !== "undefined" && "randomUUID" in crypto ? (crypto as any).randomUUID() : `sess_${Math.random().toString(16).slice(2)}`;

  const createEarAudiogram = (ear: Ear): EarAudiogram => ({
    ear,
    transducer: "air",
    thresholds_by_hz: createEmptyThresholds(frequenciesHz),
    trials: [],
    flags: { hit_floor: false, hit_ceiling: false, incomplete: false },
  });

  return {
    session_id,
    subject_id: opts?.subjectId,
    started_at: Date.now(),
    calibration_profile_id: calibration.id,
    device_label: calibration.deviceLabel,
    transducer: "air",
    left: createEarAudiogram("L"),
    right: createEarAudiogram("R"),
  };
}
