import type { HearingProfile, BiquadSpec, CompressorSpec, TinnitusSpec } from "./profiles";

export type Range = { min: number; max: number };
export type RandomMode = "perPlay" | "perLevel";

export type FilterSpec = {
  type: BiquadSpec["type"];
  freqHz: number | Range;
  q?: number | Range;
  gainDb?: number | Range;
};

export type NoiseSpec = {
  enabled: boolean;
  /** Linear gain applied to generated noise. */
  gain: number | Range;
  /** Optional highpass to emphasize hiss. */
  highpassHz?: number | Range;
  /** Optional lowpass to shape noise bandwidth. */
  lowpassHz?: number | Range;
  /** Optional bandpass center frequency to emphasize masking region. */
  bandpassHz?: number | Range;
  /** Optional amplitude modulation rate (Hz). */
  modulateHz?: number | Range;
  /** Modulation depth 0..1. */
  modDepth?: number | Range;
};

export type HearingLossProfileDefinition = {
  id: string;
  displayName: string;
  description: string;
  randomMode: RandomMode;

  outputGainDb?: number | Range;

  filters: {
    left: FilterSpec[];
    right: FilterSpec[];
  };

  earGainDb?: {
    left?: number | Range;
    right?: number | Range;
  };

  compressor?: {
    enabled: boolean;
    thresholdDb?: number | Range;
    kneeDb?: number | Range;
    ratio?: number | Range;
    attackSec?: number | Range;
    releaseSec?: number | Range;
  };

  tinnitus?: {
    enabled: boolean;
    freqHz: number | Range;
    /** Linear gain (0..1-ish). */
    level: number | Range;
  };

  noise?: NoiseSpec;

  /** Optional temporal smoothing (short delay mix). */
  smoothing?: { enabled: boolean; delayMs: number | Range; mix: number | Range };

  /** Optional clarity reduction (HF smear/distortion). */
  clarityLoss?: {
    enabled: boolean;
    highpassHz?: number | Range;
    smearMs?: number | Range;
    distortionAmount?: number | Range;
    mix: number | Range;
  };

  /** Optional transient softening (conductive-like). */
  transientSoftening?: { enabled: boolean; amount: number | Range };

  mute?: boolean;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStringToSeed(input: string): number {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function sampleRange(r: Range, rng: () => number) {
  return r.min + (r.max - r.min) * rng();
}

function resolveNumber(x: number | Range | undefined, rng: () => number): number | undefined {
  if (x === undefined) return undefined;
  return typeof x === "number" ? x : sampleRange(x, rng);
}

const BAND_HZ = [250, 500, 1000, 2000, 3000, 4000, 6000, 8000] as const;
type BandHz = (typeof BAND_HZ)[number];
type BandMap = Partial<Record<BandHz, number>>;

function bandEqToFilterSpecs(eq: BandMap, opts?: { q?: number; omitZero?: boolean }): FilterSpec[] {
  const q = opts?.q ?? 1.2;
  const omitZero = opts?.omitZero ?? true;
  const specs: FilterSpec[] = [];
  for (const hz of BAND_HZ) {
    const gainDb = eq[hz] ?? 0;
    if (omitZero && gainDb === 0) continue;
    specs.push({ type: "peaking", freqHz: hz, gainDb, q });
  }
  return specs;
}

function resolveFilterSpec(spec: FilterSpec, rng: () => number): BiquadSpec {
  const frequency = resolveNumber(spec.freqHz, rng) ?? 1000;
  const gain = resolveNumber(spec.gainDb ?? 0, rng) ?? 0;
  const Q = resolveNumber(spec.q, rng);
  return {
    type: spec.type,
    frequency,
    gain,
    ...(Q !== undefined ? { Q } : {}),
  };
}

export function sampleHearingLossProfile(
  def: HearingLossProfileDefinition,
  opts?: { seed?: number }
): HearingProfile {
  const seed = opts?.seed ?? hashStringToSeed(`${def.id}_${Date.now()}`);
  const rng = mulberry32(seed);

  const leftFilters: BiquadSpec[] = def.filters.left.map((f) => resolveFilterSpec(f, rng));
  const rightFilters: BiquadSpec[] = def.filters.right.map((f) => resolveFilterSpec(f, rng));

  const outputGainDb = resolveNumber(def.outputGainDb, rng);

  const compressor: CompressorSpec | undefined = def.compressor?.enabled
    ? {
        threshold: resolveNumber(def.compressor.thresholdDb, rng),
        knee: resolveNumber(def.compressor.kneeDb, rng),
        ratio: resolveNumber(def.compressor.ratio, rng),
        attack: resolveNumber(def.compressor.attackSec, rng),
        release: resolveNumber(def.compressor.releaseSec, rng),
      }
    : undefined;

  // Remove undefined fields (WebAudio nodes are picky about NaN).
  if (compressor) {
    for (const k of Object.keys(compressor) as (keyof CompressorSpec)[]) {
      if ((compressor as any)[k] === undefined) delete (compressor as any)[k];
    }
  }

  const tinnitus: TinnitusSpec | undefined = def.tinnitus?.enabled
    ? {
        enabled: true,
        frequency: resolveNumber(def.tinnitus.freqHz, rng) ?? 7000,
        gain: clamp(resolveNumber(def.tinnitus.level, rng) ?? 0, 0, 1),
      }
    : undefined;

  const noise = def.noise?.enabled
    ? {
        enabled: true,
        gain: clamp(resolveNumber(def.noise.gain, rng) ?? 0, 0, 1),
        highpassHz: resolveNumber(def.noise.highpassHz, rng),
        lowpassHz: resolveNumber(def.noise.lowpassHz, rng),
        bandpassHz: resolveNumber(def.noise.bandpassHz, rng),
        modulateHz: resolveNumber(def.noise.modulateHz, rng),
        modDepth: clamp(resolveNumber(def.noise.modDepth, rng) ?? 0, 0, 1),
      }
    : undefined;

  const earGainDb = def.earGainDb
    ? {
        left: resolveNumber(def.earGainDb.left as any, rng),
        right: resolveNumber(def.earGainDb.right as any, rng),
      }
    : undefined;

  const smoothing = def.smoothing?.enabled
    ? {
        enabled: true,
        delayMs: clamp(resolveNumber(def.smoothing.delayMs, rng) ?? 0, 0, 50),
        mix: clamp(resolveNumber(def.smoothing.mix, rng) ?? 0, 0, 1),
      }
    : undefined;

  const clarityLoss = def.clarityLoss?.enabled
    ? {
        enabled: true,
        highpassHz: resolveNumber(def.clarityLoss.highpassHz, rng),
        smearMs: clamp(resolveNumber(def.clarityLoss.smearMs, rng) ?? 0, 0, 50),
        distortionAmount: clamp(resolveNumber(def.clarityLoss.distortionAmount, rng) ?? 0, 0, 1),
        mix: clamp(resolveNumber(def.clarityLoss.mix, rng) ?? 0, 0, 1),
      }
    : undefined;

  const transientSoftening = def.transientSoftening?.enabled
    ? {
        enabled: true,
        amount: clamp(resolveNumber(def.transientSoftening.amount, rng) ?? 0.5, 0, 1),
      }
    : undefined;

  return {
    id: def.id,
    name: def.displayName,
    description: def.description,
    params: {
      earFilters: { left: leftFilters, right: rightFilters },
      earGainDb,
      ...(outputGainDb !== undefined ? { globalGain: outputGainDb } : {}),
      ...(compressor ? { compressor } : {}),
      ...(tinnitus ? { tinnitus } : {}),
      ...(noise ? { noise } : {}),
      ...(smoothing ? { smoothing } : {}),
      ...(clarityLoss ? { clarityLoss } : {}),
      ...(transientSoftening ? { transientSoftening } : {}),
      ...(def.mute ? { mute: true } : {}),
    },
  };
}

// ---- Profile definitions (educational sound simulations; not diagnostic) ----

const recruitmentLight = {
  enabled: true,
  thresholdDb: { min: -30, max: -18 },
  ratio: { min: 2.0, max: 4.0 },
  kneeDb: { min: 10, max: 24 },
  attackSec: { min: 0.003, max: 0.01 },
  releaseSec: { min: 0.05, max: 0.2 },
} satisfies HearingLossProfileDefinition["compressor"];

export const hearingLossProfileDefinitions: HearingLossProfileDefinition[] = [
  {
    id: "normal",
    displayName: "Normal hearing (control)",
    description: "Baseline playback (no simulated loss).",
    randomMode: "perLevel",
    filters: { left: [], right: [] },
  },
  {
    id: "hf_sloping_age",
    // Note: previously included qualifier "(age-related)".
    displayName: "High-frequency sloping loss",
    description: "Progressive reduction in high frequencies.",
    randomMode: "perLevel",
    filters: {
      left: bandEqToFilterSpecs({ 250: 0, 500: 0, 1000: 0, 2000: -3, 3000: -6, 4000: -10, 6000: -15, 8000: -20 }),
      right: bandEqToFilterSpecs({ 250: 0, 500: 0, 1000: 0, 2000: -3, 3000: -6, 4000: -10, 6000: -15, 8000: -20 }),
    },
    clarityLoss: { enabled: true, highpassHz: 3000, smearMs: 6, distortionAmount: 0.12, mix: 0.22 },
    compressor: recruitmentLight,
  },
  {
    id: "notch_4khz",
    displayName: "4 kHz notch noise-induced loss",
    description: "Dip around 3–6 kHz (noise notch).",
    randomMode: "perLevel",
    filters: {
      left: bandEqToFilterSpecs({ 250: 0, 500: 0, 1000: 0, 2000: 0, 3000: -6, 4000: -18, 6000: -10, 8000: -4 }, { q: 1.4 }),
      right: bandEqToFilterSpecs({ 250: 0, 500: 0, 1000: 0, 2000: 0, 3000: -6, 4000: -18, 6000: -10, 8000: -4 }, { q: 1.4 }),
    },
  },
  {
    id: "broad_hf_noise_damage",
    displayName: "Broad high-frequency noise-induced loss (notch + slope)",
    description: "Noise notch plus overall high-frequency reduction.",
    randomMode: "perLevel",
    filters: {
      left: bandEqToFilterSpecs({ 250: 0, 500: 0, 1000: 0, 2000: -6, 3000: -10, 4000: -15, 6000: -20, 8000: -25 }),
      right: bandEqToFilterSpecs({ 250: 0, 500: 0, 1000: 0, 2000: -6, 3000: -10, 4000: -15, 6000: -20, 8000: -25 }),
    },
    clarityLoss: { enabled: true, highpassHz: 3000, smearMs: 7, distortionAmount: 0.16, mix: 0.28 },
  },
  {
    id: "flat_snhl",
    displayName: "Flat SNHL",
    description: "Uniform attenuation across frequencies.",
    randomMode: "perLevel",
    outputGainDb: { min: -12, max: -18 },
    filters: { left: [], right: [] },
    compressor: recruitmentLight,
  },
  {
    id: "steep_hf_sloping",
    displayName: "Steep high-frequency sloping",
    description: "Near-normal lows/mids with strong high-frequency drop.",
    randomMode: "perLevel",
    filters: {
      left: bandEqToFilterSpecs({ 250: 0, 500: 0, 1000: 0, 2000: -5, 3000: -12, 4000: -20, 6000: -30, 8000: -40 }),
      right: bandEqToFilterSpecs({ 250: 0, 500: 0, 1000: 0, 2000: -5, 3000: -12, 4000: -20, 6000: -30, 8000: -40 }),
    },
    clarityLoss: { enabled: true, highpassHz: 2500, smearMs: 8, distortionAmount: 0.18, mix: 0.32 },
  },
  {
    id: "low_frequency_loss",
    // Note: previously included qualifier "(reverse slope)".
    displayName: "Low-frequency loss",
    description: "Reduced low frequencies with better highs.",
    randomMode: "perLevel",
    filters: {
      left: bandEqToFilterSpecs({ 250: -20, 500: -15, 1000: -8, 2000: 0, 3000: 0, 4000: 0, 6000: 0, 8000: 0 }),
      right: bandEqToFilterSpecs({ 250: -20, 500: -15, 1000: -8, 2000: 0, 3000: 0, 4000: 0, 6000: 0, 8000: 0 }),
    },
  },
  {
    id: "cookie_bite",
    displayName: "Cookie-bite (mid-frequency dip)",
    description: "Mid-frequency dip around ~1–2 kHz.",
    randomMode: "perLevel",
    filters: {
      left: bandEqToFilterSpecs({ 250: 0, 500: -8, 1000: -15, 2000: -15, 3000: -8, 4000: 0, 6000: 0, 8000: 0 }, { q: 1.35 }),
      right: bandEqToFilterSpecs({ 250: 0, 500: -8, 1000: -15, 2000: -15, 3000: -8, 4000: 0, 6000: 0, 8000: 0 }, { q: 1.35 }),
    },
  },
  {
    id: "asymmetric_lr",
    displayName: "Asymmetric loss (left/right different)",
    description: "Different loss patterns between left and right ear.",
    randomMode: "perLevel",
    // Example: left ear = hf_sloping_age, right ear = normal.
    filters: {
      left: bandEqToFilterSpecs({ 250: 0, 500: 0, 1000: 0, 2000: -3, 3000: -6, 4000: -10, 6000: -15, 8000: -20 }),
      right: bandEqToFilterSpecs({ 250: 0, 500: 0, 1000: 0, 2000: 0, 3000: 0, 4000: 0, 6000: 0, 8000: 0 }),
    },
  },
  {
    id: "conductive_muffling",
    displayName: "Conductive muffling",
    description: "Global attenuation plus reduced high-frequency detail.",
    randomMode: "perLevel",
    outputGainDb: { min: -10, max: -20 },
    filters: {
      left: [
        // Low-pass around 2–3 kHz.
        { type: "lowpass", freqHz: { min: 2000, max: 3000 }, gainDb: 0, q: 0.7 },
      ],
      right: [
        { type: "lowpass", freqHz: { min: 2000, max: 3000 }, gainDb: 0, q: 0.7 },
      ],
    },
    transientSoftening: { enabled: true, amount: { min: 0.35, max: 0.65 } },
    smoothing: { enabled: true, delayMs: { min: 3, max: 7 }, mix: { min: 0.08, max: 0.16 } },
  },
  {
    id: "mixed_loss",
    displayName: "Mixed loss (conductive + SNHL)",
    description: "Attenuation plus high-frequency loss shape.",
    randomMode: "perLevel",
    outputGainDb: { min: -12, max: -22 },
    filters: {
      left: [
        { type: "lowpass", freqHz: { min: 2000, max: 3000 }, gainDb: 0, q: 0.7 },
        ...bandEqToFilterSpecs({ 250: 0, 500: 0, 1000: 0, 2000: -3, 3000: -6, 4000: -10, 6000: -15, 8000: -20 }),
      ],
      right: [
        { type: "lowpass", freqHz: { min: 2000, max: 3000 }, gainDb: 0, q: 0.7 },
        ...bandEqToFilterSpecs({ 250: 0, 500: 0, 1000: 0, 2000: -3, 3000: -6, 4000: -10, 6000: -15, 8000: -20 }),
      ],
    },
    transientSoftening: { enabled: true, amount: { min: 0.35, max: 0.7 } },
    clarityLoss: { enabled: true, highpassHz: 2800, smearMs: 7, distortionAmount: 0.14, mix: 0.22 },
    compressor: recruitmentLight,
  },
  {
    id: "speech_in_noise",
    displayName: "Speech-in-noise difficulty (optional)",
    description: "Adds shaped noise to reduce intelligibility (experience profile).",
    randomMode: "perLevel",
    filters: { left: [], right: [] },
    noise: {
      enabled: true,
      // Approximate +5 dB to -5 dB SNR via gain range (engine doesn't measure signal level).
      gain: { min: 0.03, max: 0.10 },
      // Shape towards speech band and emphasize 2–4 kHz.
      highpassHz: { min: 500, max: 900 },
      lowpassHz: { min: 4500, max: 6500 },
      bandpassHz: { min: 2500, max: 3800 },
      modulateHz: { min: 2.5, max: 6.0 },
      modDepth: { min: 0.35, max: 0.7 },
    },
    // Keep playback dynamics natural; avoid extra processing beyond masking.
  },
  {
    id: "profound",
    displayName: "Profound loss",
    description: "Extreme attenuation across spectrum with additional high-frequency reduction.",
    randomMode: "perLevel",
    outputGainDb: { min: -40, max: -60 },
    filters: {
      left: [{ type: "lowpass", freqHz: { min: 900, max: 1200 }, gainDb: 0, q: 0.7 }],
      right: [{ type: "lowpass", freqHz: { min: 900, max: 1200 }, gainDb: 0, q: 0.7 }],
    },
  },
  {
    id: "mute",
    displayName: "Full deafness joke (mute output)",
    description: "Mutes output entirely (educational joke level).",
    randomMode: "perLevel",
    filters: { left: [], right: [] },
    mute: true,
  },
];

export const hearingLossProfileById: Record<string, HearingLossProfileDefinition> = Object.fromEntries(
  hearingLossProfileDefinitions.map((p) => [p.id, p])
);
