import { describe, expect, it } from "vitest";
import { applyRAppTrial, createRAppState } from "./rapp";

describe("R-App staircase", () => {
  it("starts at 40 dB HL", () => {
    const s = createRAppState();
    expect(s.suggestedDbHl).toBe(40);
    expect(s.stage).toBe("coarse");
    expect(s.complete).toBe(false);
  });

  it("applies -10 after YES and +5 after NO", () => {
    const s0 = createRAppState();
    const a = applyRAppTrial(s0, 40, "yes");
    expect(a.stepApplied).toBe(-10);
    expect(a.nextState.suggestedDbHl).toBe(30);

    const b = applyRAppTrial(a.nextState, 30, "no");
    expect(b.stepApplied).toBe(5);
    expect(b.nextState.suggestedDbHl).toBe(35);
  });

  it("stops after three YES at the same level", () => {
    let s = createRAppState();
    // Always present 40 and answer YES.
    for (let i = 0; i < 2; i++) {
      const u = applyRAppTrial(s, 40, "yes");
      expect(u.thresholdReached).toBe(false);
      s = u.nextState;
    }
    const last = applyRAppTrial(s, 40, "yes");
    expect(last.thresholdReached).toBe(true);
    expect(last.nextState.complete).toBe(true);
    expect(last.nextState.thresholdDbHl).toBe(40);
  });

  it("switches to fine after first NO", () => {
    const s0 = createRAppState();
    const u = applyRAppTrial(s0, 40, "no");
    expect(u.nextState.stage).toBe("fine");
  });
});
