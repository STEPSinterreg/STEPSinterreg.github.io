import { describe, expect, it } from "vitest";
import {
  LOUDNESS_MAX_LEVEL,
  LOUDNESS_MIN_LEVEL,
  clampLevel,
  levelToDb,
  levelToGain,
} from "./loudness";

describe("loudness mapping", () => {
  it("maps level 1 to -80 dB and level 100 to 0 dB", () => {
    expect(levelToDb(1)).toBeCloseTo(-80, 6);
    expect(levelToDb(100)).toBeCloseTo(0, 6);
  });

  it("gain is capped by maxGain", () => {
    expect(levelToGain(100, 0.5)).toBeCloseTo(0.5, 6);
    expect(levelToGain(100, 1.0)).toBeCloseTo(1.0, 6);
  });

  it("clamps levels", () => {
    expect(clampLevel(0)).toBe(LOUDNESS_MIN_LEVEL);
    expect(clampLevel(101)).toBe(LOUDNESS_MAX_LEVEL);
  });

  it("rounds float inputs", () => {
    expect(clampLevel(1.2)).toBe(1);
    expect(clampLevel(1.6)).toBe(2);
    expect(clampLevel(99.6)).toBe(100);
  });
});
