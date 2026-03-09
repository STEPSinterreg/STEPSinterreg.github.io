export type BiquadSpec = {
  type: 'lowshelf' | 'highshelf' | 'peaking' | 'notch' | 'lowpass' | 'highpass' | 'bandpass';
  frequency: number;
  gain: number; // dB
  Q?: number;
};

export type EarKey = 'left' | 'right';

export type CompressorSpec = {
  threshold?: number; // dB
  knee?: number;
  ratio?: number;
  attack?: number;
  release?: number;
};

export type TinnitusSpec = {
  enabled: boolean;
  frequency: number;
  gain: number; // linear 0..1
};

export type ProfileParams = {
  globalGain?: number; // dB attenuation if negative
  filters?: BiquadSpec[];
  /** Optional per-ear filter chains (for asymmetric profiles). */
  earFilters?: { left: BiquadSpec[]; right: BiquadSpec[] };
  /** Optional per-ear gain (dB), applied after earFilters. */
  earGainDb?: { left?: number; right?: number };
  compressor?: CompressorSpec;
  tinnitus?: TinnitusSpec;
  distortion?: { amount: number } | undefined;

  /** Optional short-delay temporal smoothing (3–10 ms range). */
  smoothing?: { enabled: boolean; delayMs: number; mix: number };

  /** Optional clarity reduction (e.g., HF smearing/distortion). */
  clarityLoss?: {
    enabled: boolean;
    /** Apply effect mostly above this frequency. */
    highpassHz?: number;
    /** Optional additional smearing delay (ms). */
    smearMs?: number;
    /** Optional waveshaper amount (0..1-ish). */
    distortionAmount?: number;
    /** Wet mix 0..1. */
    mix: number;
  };

  /** Optional transient softening (useful for conductive losses). */
  transientSoftening?: { enabled: boolean; amount: number };

  /** Mute output entirely (educational “full deafness” joke level). */
  mute?: boolean;
  /** Optional noise mix (speech-in-noise difficulty). */
  noise?: {
    enabled: boolean;
    /** Linear gain applied to generated noise. */
    gain: number;
    highpassHz?: number;
    lowpassHz?: number;
    /** Optional bandpass emphasis (e.g., 2–4 kHz region). */
    bandpassHz?: number;
    /** Optional amplitude modulation rate (Hz) to avoid static white noise. */
    modulateHz?: number;
    /** Modulation depth 0..1 (applied as gain*(1±depth)). */
    modDepth?: number;
  };
  /** Legacy flag: whether to treat channels differently. Prefer earFilters instead. */
  asymmetric?: boolean;
};

export type HearingProfile = {
  id: string;
  name: string;
  description: string;
  params: ProfileParams;
};

export type CorrectionParams = {
  highShelfGain?: number; // dB
  lowShelfGain?: number; // dB
  notchFreq?: number; // Hz
  notchDepth?: number; // dB (negative)
  /** Per-frequency EQ adjustments in dB (peaking filters at each frequency). */
  eqByHzDb?: Record<number, number>;
  /** Optional per-ear per-frequency EQ adjustments in dB. Overrides eqByHzDb for that ear. */
  eqByHzDbByEar?: { left?: Record<number, number>; right?: Record<number, number> };
  compressionAmount?: number; // 0-100 -> map in engine
  tinnitusOn?: boolean;
  tinnitusFreq?: number;
  tinnitusLevel?: number; // 0-1
  asymmetric?: boolean;
  leftEarAttenuation?: number; // dB
  rightEarAttenuation?: number; // dB
  /**
   * Force dual-mono routing in per-ear processing mode.
   * Useful for mono/left-only media sources where channel-splitting would
   * otherwise make the right ear silent/very low.
   */
  forceDualMono?: boolean;
};

// Helper constants
const mildLowPass: BiquadSpec = { type: 'peaking', frequency: 8000, gain: -6, Q: 0.8 };

export const hearingProfiles: HearingProfile[] = [
  {
    id: 'conductive',
    name: 'Konduktiv (global dæmpning)',
    description: 'Global dæmpning med let lavpas.',
    params: { globalGain: -12, filters: [ { type: 'peaking', frequency: 1000, gain: -3, Q: 0.7 }, mildLowPass ] },
  },
  {
    id: 'hf_sensorineural',
    name: 'Højfrekvent sensorineuralt',
    description: 'Tab i de høje frekvenser.',
    params: { filters: [ { type: 'highshelf', frequency: 3000, gain: -12 } ] },
  },
  {
    id: 'lf_sensorineural',
    name: 'Lavfrekvent sensorineuralt',
    description: 'Tab i de lave frekvenser.',
    params: { filters: [ { type: 'lowshelf', frequency: 500, gain: -10 } ] },
  },
  {
    id: '4khz_notch',
    name: '4 kHz notch skade',
    description: 'Notch omkring 4 kHz for "killing the s"-sounds.',
    params: { filters: [ { type: 'notch', frequency: 4000, gain: -20, Q: 10 } ] },
  },
  {
    id: 'asymmetric',
    name: 'Asymmetrisk tab',
    description: 'Én kanal med højfrekvent tab.',
    params: { asymmetric: true, filters: [ { type: 'highshelf', frequency: 3000, gain: -12 } ] },
  },
  {
    id: 'recruitment',
    name: 'Rekruttering (kraftig kompression)',
    description: 'Kraftig kompression som giver rekruttering.',
    params: { compressor: { threshold: -50, ratio: 12, attack: 0.01, release: 0.25 } },
  },
  {
    id: 'speech_distortion',
    name: 'Taleforvrængning',
    description: 'Mild waveshaper for at forvrænge talen.',
    params: { distortion: { amount: 0.2 } },
  },
  {
    id: 'mixed',
    name: 'Blandet tab',
    description: 'Global dæmpning kombineret med højfrekvent tab.',
    params: { globalGain: -8, filters: [ { type: 'highshelf', frequency: 2500, gain: -8 } ] },
  },
  {
    id: 'tinnitus',
    name: 'Tinnitus',
    description: 'Højfrekvent tone (6–8 kHz) tilføjet.',
    params: { tinnitus: { enabled: true, frequency: 7000, gain: 0.02 } },
  },
  {
    id: 'complex',
    name: 'Kompleks profil',
    description: 'Moderat højfrekvent tab + notch + let kompression.',
    params: {
      filters: [ { type: 'highshelf', frequency: 3000, gain: -8 }, { type: 'notch', frequency: 4000, gain: -12, Q: 8 } ],
      compressor: { threshold: -40, ratio: 4, attack: 0.01, release: 0.2 },
    },
  },
];

export const getProfileById = (id: string) => hearingProfiles.find((p) => p.id === id) || hearingProfiles[0];
