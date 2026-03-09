import { describe, expect, it } from "vitest";
import { hearingLossProfileById, sampleHearingLossProfile } from "./hearingLossProfiles";

describe("hearingLossProfiles sampling", () => {
  it("is deterministic with a fixed seed", () => {
    const def = hearingLossProfileById["hf_sloping_age"];
    const p1 = sampleHearingLossProfile(def, { seed: 12345 });
    const p2 = sampleHearingLossProfile(def, { seed: 12345 });
    expect(p1).toEqual(p2);
  });

  it("samples values within expected bounds", () => {
    const def = hearingLossProfileById["notch_4khz"];
    const p = sampleHearingLossProfile(def, { seed: 1 });
    const left = p.params.earFilters?.left ?? [];
    const f4k = left.find((f) => f.type === "peaking" && f.frequency === 4000);
    expect(f4k).toBeTruthy();
    if (!f4k) return;
    // Spec: 4 kHz is the deepest notch.
    expect(f4k.gain).toBeLessThanOrEqual(-18);
  });
});
