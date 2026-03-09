import { describe, expect, it } from "vitest";
import { createAudiometrySession } from "./model";
import { AUDIOGRAM_FREQUENCIES_HZ, defaultCalibrationProfile } from "../../../audio/calibration";

describe("createAudiometrySession", () => {
  it("does not share nested left/right state", () => {
    const s = createAudiometrySession(AUDIOGRAM_FREQUENCIES_HZ, defaultCalibrationProfile);

    expect(s.left.thresholds_by_hz).not.toBe(s.right.thresholds_by_hz);
    expect(s.left.trials).not.toBe(s.right.trials);
    expect(s.left.flags).not.toBe(s.right.flags);

    s.right.thresholds_by_hz[250] = 10;
    expect(s.left.thresholds_by_hz[250]).not.toBe(10);
  });
});
