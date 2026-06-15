import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AudioSpectrum from "../../components/AudioSpectrum";
import LabeledSlider from "../../components/LabeledSlider";
import UnifiedAudioPlayer, { type SoundOption } from "../../components/UnifiedAudioPlayer";
import { engine } from "../../audio/engine";
import { AUDIOGRAM_FREQUENCIES_HZ, defaultCalibrationProfile } from "../../audio/calibration";
import { hashStringToSeed, hearingLossProfileById, sampleHearingLossProfile } from "../../audio/hearingLossProfiles";
import type { HearingProfile } from "../../audio/profiles";
import { useLocale } from "../../i18n/LocaleContext";
import { useTheme } from "../../i18n/ThemeContext";
import { translations } from "../../i18n/translations";
import { type Ear } from "./audiometry/rapp";
import { createAudiometrySession, type AudiometrySession } from "./audiometry/model";
import {
  clampLevel,
  levelToGainForFrequency,
  LOUDNESS_START_LEVEL,
} from "./audiometry/loudness";
import { HIDE_HEARING_LOSS_PROFILE_LABELS, isHearingLossLevelEnabled } from "./levelConfig";
import { HearingLossCompare } from "./HearingLossCompare";

const LEVELS = [
  {
    id: "intro",
    titleKey: "hearingLossExperience.level.intro.title",
    subtitleKey: "hearingLossExperience.level.intro.subtitle",
    profileId: "normal",
  },
  {
    id: "hf_sloping_age",
    titleKey: "hearingLossExperience.level.hf_sloping_age.title",
    subtitleKey: "hearingLossExperience.level.hf_sloping_age.subtitle",
    profileId: "hf_sloping_age",
  },
  {
    id: "notch_4khz",
    titleKey: "hearingLossExperience.level.notch_4khz.title",
    subtitleKey: "hearingLossExperience.level.notch_4khz.subtitle",
    profileId: "notch_4khz",
  },
  {
    id: "broad_hf_noise_damage",
    titleKey: "hearingLossExperience.level.broad_hf_noise_damage.title",
    subtitleKey: "hearingLossExperience.level.broad_hf_noise_damage.subtitle",
    profileId: "broad_hf_noise_damage",
  },
  {
    id: "flat_snhl",
    titleKey: "hearingLossExperience.level.flat_snhl.title",
    subtitleKey: "hearingLossExperience.level.flat_snhl.subtitle",
    profileId: "flat_snhl",
  },
  {
    id: "steep_hf_sloping",
    titleKey: "hearingLossExperience.level.steep_hf_sloping.title",
    subtitleKey: "hearingLossExperience.level.steep_hf_sloping.subtitle",
    profileId: "steep_hf_sloping",
  },
  {
    id: "low_frequency_loss",
    titleKey: "hearingLossExperience.level.low_frequency_loss.title",
    subtitleKey: "hearingLossExperience.level.low_frequency_loss.subtitle",
    profileId: "low_frequency_loss",
  },
  {
    id: "cookie_bite",
    titleKey: "hearingLossExperience.level.cookie_bite.title",
    subtitleKey: "hearingLossExperience.level.cookie_bite.subtitle",
    profileId: "cookie_bite",
  },
  {
    id: "asymmetric_lr",
    titleKey: "hearingLossExperience.level.asymmetric_lr.title",
    subtitleKey: "hearingLossExperience.level.asymmetric_lr.subtitle",
    profileId: "asymmetric_lr",
  },
  {
    id: "conductive_muffling",
    titleKey: "hearingLossExperience.level.conductive_muffling.title",
    subtitleKey: "hearingLossExperience.level.conductive_muffling.subtitle",
    profileId: "conductive_muffling",
  },
  {
    id: "mixed_loss",
    titleKey: "hearingLossExperience.level.mixed_loss.title",
    subtitleKey: "hearingLossExperience.level.mixed_loss.subtitle",
    profileId: "mixed_loss",
  },
  {
    id: "speech_in_noise",
    titleKey: "hearingLossExperience.level.speech_in_noise.title",
    subtitleKey: "hearingLossExperience.level.speech_in_noise.subtitle",
    profileId: "speech_in_noise",
  },
  {
    id: "profound",
    titleKey: "hearingLossExperience.level.profound.title",
    subtitleKey: "hearingLossExperience.level.profound.subtitle",
    profileId: "profound",
  },
  {
    id: "deafness",
    titleKey: "hearingLossExperience.level.deafness.title",
    subtitleKey: "hearingLossExperience.level.deafness.subtitle",
    profileId: "mute",
  },
] as const;

const LIVE_PROFILES = [
  {
    id: "normal",
    titleKey: "hearingLossExperience.compare.profile.normal",
    subtitleKey: "hearingLossExperience.compare.profile.normal.desc",
  },
  {
    id: "low_frequency_loss",
    titleKey: "hearingLossExperience.level.low_frequency_loss.title",
    subtitleKey: "hearingLossExperience.compare.profile.low_frequency_loss.desc",
  },
  {
    id: "hf_sloping_age",
    titleKey: "hearingLossExperience.level.hf_sloping_age.title",
    subtitleKey: "hearingLossExperience.compare.profile.hf_sloping_age.desc",
  },
  {
    id: "speech_in_noise",
    titleKey: "hearingLossExperience.level.speech_in_noise.title",
    subtitleKey: "hearingLossExperience.level.speech_in_noise.subtitle",
  },
] as const;

type LevelId = (typeof LEVELS)[number]["id"];
type LevelStage = "listen" | "test" | "audiogram" | "correct";
type LiveProfileId = (typeof LIVE_PROFILES)[number]["id"];

// Debug/education default: make loss effects clearly audible.
// This scales EQ/filter gains for loss profiles so HF/LF damping is obvious.
const SEVERE_LOSS_GAIN_SCALE = 1.8;

const toSevereProfile = (profile: HearingProfile, opts?: { enabled?: boolean }): HearingProfile => {
  if (!opts?.enabled) return profile;
  if (!profile?.params) return profile;

  const params: any = profile.params as any;
  const earFilters = params.earFilters;
  if (!earFilters || (!earFilters.left && !earFilters.right)) return profile;

  const scaleGain = (gain: unknown) => {
    if (typeof gain !== "number" || !Number.isFinite(gain)) return gain;
    return clamp(gain * SEVERE_LOSS_GAIN_SCALE, -60, 60);
  };

  const scaleFilter = (f: any) => {
    if (!f || typeof f !== "object") return f;
    // Only filters with a gain parameter should be scaled.
    if (typeof f.gain !== "number") return f;
    return { ...f, gain: scaleGain(f.gain) };
  };

  const next: HearingProfile = {
    ...profile,
    params: {
      ...params,
      earFilters: {
        left: Array.isArray(earFilters.left) ? earFilters.left.map(scaleFilter) : earFilters.left,
        right: Array.isArray(earFilters.right) ? earFilters.right.map(scaleFilter) : earFilters.right,
      },
    },
  };

  return next;
};

type AudiogramPoint = {
  freqHz: number;
  /** 0..100 (visual scale, lower is better) */
  y: number;
};

type AdjustedByHz = Record<number, AudiogramPoint>;

type LevelSessionState = {
  audiometry: AudiometrySession;
  freqIndex: number;
  ear: Ear;
  sliderLevel: number;
  muted: boolean;
  adjustedRight: AdjustedByHz;
  adjustedLeft: AdjustedByHz;
  lastStage: LevelStage;
};

type LevelMeta = {
  id: LevelId;
  titleKey: string;
  subtitleKey: string;
  profileId: string;
};

// Keep the audiometry flow shorter for this learning experience.
// We intentionally skip the inter-octave bands 3 kHz and 6 kHz.
const TEST_FREQUENCIES_HZ = AUDIOGRAM_FREQUENCIES_HZ.filter((f) => f !== 3000 && f !== 6000);

// We can't show true dB HL without calibrated hardware. Instead we map our
// Loudness Level scale (1..100) to a familiar audiogram-like range.
// -10 dB HL (top / best) .. 120 dB HL (bottom / worst)
const DBHL_MIN = -10;
const DBHL_MAX = 120;
const DBHL_RANGE = DBHL_MAX - DBHL_MIN;

function clampDbHl(dbHl: number) {
  return clamp(dbHl, DBHL_MIN, DBHL_MAX);
}

function dbHlFloatForLevel(level: number) {
  const lvl = clampLevel(level);
  return DBHL_MIN + ((lvl - 1) / 99) * DBHL_RANGE;
}

function levelForDbHl(dbHl: number) {
  const clamped = clampDbHl(dbHl);
  const level = 1 + ((clamped - DBHL_MIN) / DBHL_RANGE) * 99;
  return clampLevel(level);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function buildLiveProfile(profileId: LiveProfileId): HearingProfile | null {
  const def = hearingLossProfileById[profileId];
  if (!def) return null;

  const seed = hashStringToSeed(`live_${profileId}`);
  const base = sampleHearingLossProfile(def, { seed });
  const shouldScale = profileId !== "normal";
  return toSevereProfile(base, { enabled: shouldScale });
}

export default function HearingLoss() {
  const { locale } = useLocale();
  const { resolved: theme } = useTheme();
  const t = translations[locale];
  const [searchParams, setSearchParams] = useSearchParams();

  const isDark = theme === "dark";
  const svgGrid = isDark ? "#334155" : "#ddd9d4";
  const svgLabelDim = isDark ? "#94a3b8" : "#6b7280";
  const svgLabelMid = isDark ? "#cbd5e1" : "#9ca3af";

  // In-memory per-level progress. Intentionally not persisted: refresh resets the experience.
  const levelSessionsRef = useRef<Partial<Record<LevelId, LevelSessionState>>>({});

  const levels: LevelMeta[] = useMemo(() => {
    const all = LEVELS as unknown as LevelMeta[];
    const enabled = all.filter((l) => l.id === "intro" || isHearingLossLevelEnabled(l.id));
    return enabled.length > 0 ? enabled : all;
  }, [isHearingLossLevelEnabled]);

  const screenParam = searchParams.get("screen");
  const screen =
    screenParam === "level"      ? "level"      :
    screenParam === "experience" ? "experience" :
    screenParam === "compare"    ? "compare"    :
    screenParam === "live"       ? "live"       :
    "landing";

  const levelParam = (searchParams.get("level") ?? "") as LevelId;
  const stageParam = (searchParams.get("stage") ?? "") as LevelStage;

  const prevScreenRef = useRef<typeof screen>(screen);

  const activeLevel: LevelId = levels.some((l) => l.id === levelParam) ? levelParam : "intro";
  const activeStage: LevelStage =
    stageParam === "listen" || stageParam === "test" || stageParam === "audiogram" || stageParam === "correct"
      ? stageParam
      : "listen";

  const stagesForLevel: LevelStage[] = activeLevel === "intro" ? ["listen", "test", "audiogram"] : ["listen", "test", "audiogram", "correct"];
  const normalizedStage: LevelStage = stagesForLevel.includes(activeStage) ? activeStage : "listen";

  const [completedLevels, setCompletedLevels] = useState<LevelId[]>([]);
  const [liveProfileId, setLiveProfileId] = useState<LiveProfileId>("hf_sloping_age");
  const [liveStatus, setLiveStatus] = useState<"idle" | "starting" | "running" | "error">("idle");
  const [liveError, setLiveError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const unlockAll = () => setCompletedLevels(levels.map((l) => l.id));
    window.addEventListener("hearingLoss:unlockAll", unlockAll as EventListener);
    return () => window.removeEventListener("hearingLoss:unlockAll", unlockAll as EventListener);
  }, [levels]);

  useEffect(() => {
    return () => {
      engine.destroy();
    };
  }, []);

  useEffect(() => {
    if (screen === "live") return;
    if (liveStatus !== "idle") {
      engine.stop();
      setLiveStatus("idle");
    }
  }, [liveStatus, screen]);

  const goToExperienceMenu = () => setSearchParams({ screen: "experience" });
  const goToCompare = () => setSearchParams({ screen: "compare" });
  const goToLiveMode = () => setSearchParams({ screen: "live" });
  const goToLanding = () => setSearchParams({});

  // Used in the level-complete buttons.
  const goToMenu = goToExperienceMenu;

  const startLevel = (id: LevelId) => {
    // Prevent navigation into disabled levels (e.g. via copied URL).
    if (!levels.some((l) => l.id === id)) return;

    const stagesFor = (lvl: LevelId): LevelStage[] => (lvl === "intro" ? ["listen", "test", "audiogram"] : ["listen", "test", "audiogram", "correct"]);
    const saved = levelSessionsRef.current[id];
    const desired = saved?.lastStage;
    const stage = desired && stagesFor(id).includes(desired) ? desired : "listen";
    setSearchParams({ screen: "level", level: id, stage });
  };

  const setStage = (stage: LevelStage) => {
    const next = activeLevel === "intro" && stage === "correct" ? "audiogram" : stage;
    setSearchParams({ screen: "level", level: activeLevel, stage: next });
  };

  const levelIndex = levels.findIndex((l) => l.id === activeLevel);
  const isLocked = (id: LevelId) => {
    if (id === "intro") return false;
    const idx = levels.findIndex((l) => l.id === id);
    if (idx <= 0) return false;
    const prev = levels[idx - 1];
    return prev ? !completedLevels.includes(prev.id) : false;
  };

  const activeMeta = levels[levelIndex] ?? levels[0]!;
  const isActiveLevelCompleted = completedLevels.includes(activeLevel);
  const shouldHideProfileLabels = HIDE_HEARING_LOSS_PROFILE_LABELS && activeMeta.id !== "intro" && !isActiveLevelCompleted;
  const visibleLevelTitle = shouldHideProfileLabels ? t["hearingLossExperience.level.hidden.title"] : t[activeMeta.titleKey];
  const visibleLevelSubtitle = shouldHideProfileLabels ? t["hearingLossExperience.level.hidden.subtitle"] : t[activeMeta.subtitleKey];

  // Deterministic seed: keep profile sampling stable across reloads/sessions.
  const sessionSeedRef = useRef<number>(hashStringToSeed("hearingLossExperience"));
  const sampledProfileBaseRef = useRef<HearingProfile | null>(null);
  const sampledProfileAppliedRef = useRef<HearingProfile | null>(null);

  useEffect(() => {
    // Reset any correction when switching levels.
    engine.setCorrection(null);

    const def = hearingLossProfileById[activeMeta.profileId];
    if (!def) {
      sampledProfileBaseRef.current = null;
      return;
    }

    const seed = hashStringToSeed(`${sessionSeedRef.current}_${activeMeta.id}`);
    sampledProfileBaseRef.current = sampleHearingLossProfile(def, { seed });
  }, [activeMeta.id, activeMeta.profileId]);

  useEffect(() => {
    const base = sampledProfileBaseRef.current;
    if (!base) return;

    // Force a severe, easy-to-hear variant for non-intro levels,
    // but disable the exaggeration during the correction step so the
    // "virtual hearing aid" has a realistic chance of cancelling the loss.
    const severeEligible = activeMeta.profileId !== "normal" && activeMeta.profileId !== "mute";
    const severeEnabled = severeEligible && normalizedStage !== "correct";
    const applied = toSevereProfile(base, { enabled: severeEnabled });
    sampledProfileAppliedRef.current = applied;
    void engine.setProfile(applied, 100);
  }, [activeMeta.id, activeMeta.profileId, normalizedStage]);

  useEffect(() => {
    if (screen !== "live" || liveStatus !== "running") return;
    const profile = buildLiveProfile(liveProfileId);
    if (!profile) return;
    void engine.setProfile(profile, 100);
  }, [liveProfileId, liveStatus, screen]);

  // --- Audiometry (R-App user-operated) ---
  const calibration = defaultCalibrationProfile;
  const [audiometry, setAudiometry] = useState<AudiometrySession>(() => createAudiometrySession(TEST_FREQUENCIES_HZ, calibration));
  const [freqIndex, setFreqIndex] = useState(0);
  const [ear, setEar] = useState<Ear>("R");
  const [sliderLevel, setSliderLevel] = useState<number>(() => clampLevel(LOUDNESS_START_LEVEL));
  const [sliderDbHlUi, setSliderDbHlUi] = useState<number>(() => dbHlFloatForLevel(clampLevel(LOUDNESS_START_LEVEL)));
  const [tonePlaying, setTonePlaying] = useState(false);
  const toneInFlightRef = useRef(false);
  const toneSeqRef = useRef(0);
  const autoplayBlockedUntilRef = useRef(0);
  const sliderLevelRef = useRef(sliderLevel);
  const [muted, setMuted] = useState(false);
  const [toneError, setToneError] = useState<string | null>(null);

  useEffect(() => {
    sliderLevelRef.current = sliderLevel;
  }, [sliderLevel]);

  const resetAudiometryState = () => {
    engine.stop();
    toneSeqRef.current += 1;
    toneInFlightRef.current = false;
    setTonePlaying(false);

    setAudiometry(createAudiometrySession(TEST_FREQUENCIES_HZ, calibration));
    setFreqIndex(0);
    setEar("R");
    const start = clampLevel(LOUDNESS_START_LEVEL);
    setSliderLevel(start);
    sliderLevelRef.current = start;
    setSliderDbHlUi(dbHlFloatForLevel(start));
    setMuted(false);
    setToneError(null);
  };

  // Restore saved per-level audiometry progress when switching levels.
  useEffect(() => {
    engine.stop();
    toneSeqRef.current += 1;
    toneInFlightRef.current = false;
    setTonePlaying(false);

    const saved = levelSessionsRef.current[activeLevel];
    if (!saved) {
      setAudiometry(createAudiometrySession(TEST_FREQUENCIES_HZ, calibration));
      setFreqIndex(0);
      setEar("R");
      const start = clampLevel(LOUDNESS_START_LEVEL);
      setSliderLevel(start);
      sliderLevelRef.current = start;
      setSliderDbHlUi(dbHlFloatForLevel(start));
      setMuted(false);
      setToneError(null);
      return;
    }

    setAudiometry(saved.audiometry);
    setFreqIndex(saved.freqIndex);
    setEar(saved.ear);
    const lvl = clampLevel(saved.sliderLevel);
    setSliderLevel(lvl);
    sliderLevelRef.current = lvl;
    setSliderDbHlUi(dbHlFloatForLevel(lvl));
    setMuted(saved.muted);
    setToneError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLevel]);

  const levelForStep = (stepEar: Ear, stepFreqHz: number): number => {
    const target = stepEar === "R" ? audiometry.right : audiometry.left;
    const existing = target.thresholds_by_hz[stepFreqHz];
    if (existing === null) return clampLevel(100);
    return clampLevel(typeof existing === "number" ? existing : LOUDNESS_START_LEVEL);
  };

  const goToPreviousMeasurement = async () => {
    if (ear === "R" && freqIndex === 0) return;

    const prevEar: Ear = ear === "L" ? "R" : "L";
    const prevFreqIndex = ear === "L" ? freqIndex : Math.max(0, freqIndex - 1);
    const prevFreq = TEST_FREQUENCIES_HZ[prevFreqIndex] ?? currentFreq;

    const frequencyWillChange = prevFreq !== currentFreq;

    if (!muted && frequencyWillChange && toneInFlightRef.current) {
      autoplayBlockedUntilRef.current = Date.now() + 650;
      toneSeqRef.current += 1;
      try {
        await engine.stopPureTone({ rampSeconds: 0.5 });
      } catch {
        // ignore
      } finally {
        toneInFlightRef.current = false;
        setTonePlaying(false);
      }
    }

    const nextLevel = levelForStep(prevEar, prevFreq);
    setEar(prevEar);
    setFreqIndex(prevFreqIndex);
    setSliderLevel(nextLevel);
    sliderLevelRef.current = nextLevel;
    setSliderDbHlUi(dbHlFloatForLevel(nextLevel));
    setToneError(null);

    if (!muted && frequencyWillChange) {
      void playToneOnce({ frequencyHz: prevFreq, ear: prevEar, gain: levelToGainForFrequency(nextLevel, prevFreq) });
    }
  };

  // Note: We intentionally do NOT reset audiometry when leaving a level.
  // Users can switch between levels and compare profiles, until the page is refreshed
  // or they manually clear the test data.

  const currentFreq = TEST_FREQUENCIES_HZ[freqIndex] ?? TEST_FREQUENCIES_HZ[0];
  const totalTestSteps = TEST_FREQUENCIES_HZ.length * 2;
  const currentStep = freqIndex * 2 + (ear === "R" ? 1 : 2);
  const progressNow = Math.min(currentStep, totalTestSteps);
  const progressPct = totalTestSteps > 0 ? (progressNow / totalTestSteps) * 100 : 0;

  const playToneOnce = async (overrides?: { frequencyHz?: number; ear?: Ear; gain?: number }) => {
    if (toneInFlightRef.current) return;
    toneInFlightRef.current = true;
    const seq = ++toneSeqRef.current;

    setToneError(null);
    const frequencyHz = overrides?.frequencyHz ?? currentFreq;
    const gain = typeof overrides?.gain === "number" ? overrides.gain : levelToGainForFrequency(sliderLevelRef.current, frequencyHz);
    const outputEar = overrides?.ear ?? ear;

    setTonePlaying(true);
    try {
      // 0.5s ramp up, immediately 0.5s ramp down (no steady plateau).
      await engine.playPureTone({ frequencyHz, volume: gain, ear: outputEar, rampSeconds: 0.5, steadySeconds: 0.0 });
    } catch {
      setToneError(t["hearingLossExperience.test.playError"]);
    } finally {
      if (toneSeqRef.current === seq) {
        setTonePlaying(false);
        toneInFlightRef.current = false;
      }
    }
  };

  const startLiveMonitoring = async () => {
    setLiveError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setLiveStatus("error");
      setLiveError(t["hearingLossExperience.live.noSupport"]);
      return;
    }

    const profile = buildLiveProfile(liveProfileId);
    if (!profile) {
      setLiveStatus("error");
      setLiveError(t["hearingLossExperience.live.error"]);
      return;
    }

    try {
      setLiveStatus("starting");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      await engine.setProfile(profile, 100);
      await engine.attachMediaStream(stream);
      setLiveStatus("running");
    } catch {
      setLiveStatus("error");
      setLiveError(t["hearingLossExperience.live.permissionDenied"]);
    }
  };

  const stopLiveMonitoring = () => {
    engine.stop();
    setLiveStatus("idle");
  };

  // Live-update tone level while playing when the slider moves.
  useEffect(() => {
    if (muted) return;
    if (!tonePlaying) return;
    engine.setPureToneVolume(levelToGainForFrequency(sliderLevel, currentFreq));
  }, [tonePlaying, muted, currentFreq, sliderLevel]);

  // Autoplay tones at fixed intervals while in the test stage.
  useEffect(() => {
    if (activeStage !== "test") return;
    if (muted) {
      engine.stop();
      return;
    }

    let canceled = false;
    const intervalMs = 2600;

    const tick = async () => {
      if (canceled) return;
      if (activeStage !== "test") return;
      if (muted) return;
      if (Date.now() < autoplayBlockedUntilRef.current) return;
      await playToneOnce();
    };

    // Start quickly, then interval.
    void tick();
    const id = window.setInterval(() => {
      void tick();
    }, intervalMs);

    return () => {
      canceled = true;
      window.clearInterval(id);
    };
    // Restart beeps when changing ear/frequency or muting.
  }, [activeStage, muted, currentFreq, ear]);

  const advanceToNextMeasurement = async () => {
    const nextEar: Ear = ear === "R" ? "L" : "R";
    const nextFreqIndex = ear === "R" ? freqIndex : freqIndex + 1;

    const nextFreq = TEST_FREQUENCIES_HZ[nextFreqIndex] ?? currentFreq;
    const frequencyWillChange = nextFreq !== currentFreq;

    // If the next step changes frequency, fade out any in-flight tone and then
    // start the new frequency (avoids abrupt frequency shifts/static).
    if (!muted && frequencyWillChange && toneInFlightRef.current) {
      autoplayBlockedUntilRef.current = Date.now() + 650;
      // Invalidate the currently in-flight promise so it can't clobber state
      // after we restart with a new frequency.
      toneSeqRef.current += 1;
      try {
        await engine.stopPureTone({ rampSeconds: 0.5 });
      } catch {
        // ignore
      } finally {
        toneInFlightRef.current = false;
        setTonePlaying(false);
      }
    }

    if (nextFreqIndex >= TEST_FREQUENCIES_HZ.length) {
      // Done: enable results button and allow moving on.
      return;
    }

    const start = levelForStep(nextEar, nextFreq);
    setEar(nextEar);
    setFreqIndex(nextFreqIndex);
    setSliderLevel(start);
    sliderLevelRef.current = start;
    setSliderDbHlUi(dbHlFloatForLevel(start));
    setToneError(null);

    if (!muted && frequencyWillChange) {
      // Start the new tone immediately after the fade-out.
      void playToneOnce({ frequencyHz: nextFreq, ear: nextEar, gain: levelToGainForFrequency(start, nextFreq) });
    }
  };

  const continueStep = async () => {
    const now = Date.now();
    const chosenLevel = clampLevel(sliderLevel);

    setAudiometry((prev) => {
      const next = structuredClone(prev) as AudiometrySession;
      const target = ear === "R" ? next.right : next.left;

      target.trials.push({
        frequency_hz: currentFreq,
        level: chosenLevel,
        gain: levelToGainForFrequency(chosenLevel, currentFreq),
        response_yesno: "yes",
        stage: "single",
        timestamp: now,
      });

      target.thresholds_by_hz[currentFreq] = chosenLevel;
      return next;
    });

    await advanceToNextMeasurement();
  };

  const cantHearTone = async () => {
    const now = Date.now();
    const ceilingLevel = clampLevel(100);

    setAudiometry((prev) => {
      const next = structuredClone(prev) as AudiometrySession;
      const target = ear === "R" ? next.right : next.left;

      target.trials.push({
        frequency_hz: currentFreq,
        level: ceilingLevel,
        gain: levelToGainForFrequency(ceilingLevel, currentFreq),
        response_yesno: "no",
        stage: "single",
        timestamp: now,
      });

      target.thresholds_by_hz[currentFreq] = null;
      target.flags.hit_ceiling = true;
      return next;
    });

    await advanceToNextMeasurement();
  };

  const isTestComplete = useMemo(() => {
    return TEST_FREQUENCIES_HZ.every(
      (f) => audiometry.left.thresholds_by_hz[f] !== undefined && audiometry.right.thresholds_by_hz[f] !== undefined
    );
  }, [audiometry.left.thresholds_by_hz, audiometry.right.thresholds_by_hz]);

  const levelToY = (level: number) => clamp(((clampLevel(level) - 1) / 99) * 100, 0, 100);

  const measuredPointsRight: AudiogramPoint[] = useMemo(() => {
    return TEST_FREQUENCIES_HZ.map((f) => {
      const th = audiometry.right.thresholds_by_hz[f];
      if (typeof th !== "number") return null;
      return { freqHz: f, y: levelToY(th) };
    }).filter(Boolean) as AudiogramPoint[];
  }, [audiometry.right.thresholds_by_hz]);

  const measuredPointsLeft: AudiogramPoint[] = useMemo(() => {
    return TEST_FREQUENCIES_HZ.map((f) => {
      const th = audiometry.left.thresholds_by_hz[f];
      if (typeof th !== "number") return null;
      return { freqHz: f, y: levelToY(th) };
    }).filter(Boolean) as AudiogramPoint[];
  }, [audiometry.left.thresholds_by_hz]);

  // Correction is still a prototype feature; keep a separate adjustable series for now.
  const [adjustedRight, setAdjustedRight] = useState<AdjustedByHz>({});
  const [adjustedLeft, setAdjustedLeft] = useState<AdjustedByHz>({});
  const [muteAdjustRight, setMuteAdjustRight] = useState(false);
  const [muteAdjustLeft, setMuteAdjustLeft] = useState(false);

  // Restore saved adjustment state when switching levels.
  useEffect(() => {
    const saved = levelSessionsRef.current[activeLevel];
    if (!saved) {
      setAdjustedRight({});
      setAdjustedLeft({});
      setMuteAdjustRight(false);
      setMuteAdjustLeft(false);
      return;
    }
    setAdjustedRight(saved.adjustedRight ?? {});
    setAdjustedLeft(saved.adjustedLeft ?? {});
    setMuteAdjustRight(false);
    setMuteAdjustLeft(false);
  }, [activeLevel]);

  // Persist current per-level progress in-memory (clears on full page reload).
  useEffect(() => {
    levelSessionsRef.current[activeLevel] = {
      audiometry,
      freqIndex,
      ear,
      sliderLevel,
      muted,
      adjustedRight,
      adjustedLeft,
      lastStage: normalizedStage,
    };
  }, [activeLevel, adjustedLeft, adjustedRight, audiometry, ear, freqIndex, muted, normalizedStage, sliderLevel]);

  const clearTestData = () => {
    resetAudiometryState();
    setAdjustedRight({});
    setAdjustedLeft({});
  };
  useEffect(() => {
    // Seed adjusted points from measured thresholds when entering correction.
    if (activeStage !== "correct") return;
    setAdjustedRight((prev) => {
      const next: AdjustedByHz = { ...prev };
      for (const p of measuredPointsRight) next[p.freqHz] = next[p.freqHz] ?? p;
      return next;
    });
    setAdjustedLeft((prev) => {
      const next: AdjustedByHz = { ...prev };
      for (const p of measuredPointsLeft) next[p.freqHz] = next[p.freqHz] ?? p;
      return next;
    });
  }, [activeStage, measuredPointsRight, measuredPointsLeft]);

  const adjustedPointsRight: AudiogramPoint[] = useMemo(
    () => TEST_FREQUENCIES_HZ.map((f) => adjustedRight[f]).filter(Boolean) as AudiogramPoint[],
    [adjustedRight]
  );
  const adjustedPointsLeft: AudiogramPoint[] = useMemo(
    () => TEST_FREQUENCIES_HZ.map((f) => adjustedLeft[f]).filter(Boolean) as AudiogramPoint[],
    [adjustedLeft]
  );

  // --- Multi audio players (visual-first) ---
  type AudioKind = "speechJessica" | "speechMark" | "street" | "birds";

  const AUDIO_FILES: Record<AudioKind, readonly string[]> = {
    speechJessica: ["Speech Jessica 1 - Not Looping.mp3", "Speech Jessica 2 - Not Looping.mp3"],
    speechMark: ["Speech Mark 1 - Not Looping.mp3", "Speech Mark 2 - Not Looping.mp3"],
    street: [
      "Busy Street 1 - Looping.wav",
      "Busy Street 2 - Looping.wav",
      "Busy Street 3 - Looping.wav",
      "Busy Street 4 - Looping.wav",
    ],
    birds: ["Birds Chirping 1 - Looping.wav", "Birds Chirping 2 - Looping.wav", "Birds Chirping 3 - Looping.wav"],
  };

  const AUDIO_LOOP: Record<AudioKind, boolean> = {
    speechJessica: false,
    speechMark: false,
    street: true,
    birds: true,
  };

  const audioKinds: readonly AudioKind[] = ["speechJessica", "speechMark", "street", "birds"];
  const toPublicAudioSrc = (fileName: string) => `/hearing-loss/audios/${encodeURIComponent(fileName)}`;
  const pickRandom = <T,>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)];

  const [audioSrcByKind, setAudioSrcByKind] = useState<Record<AudioKind, string>>(() => ({
    speechJessica: toPublicAudioSrc(pickRandom(AUDIO_FILES.speechJessica)),
    speechMark: toPublicAudioSrc(pickRandom(AUDIO_FILES.speechMark)),
    street: toPublicAudioSrc(pickRandom(AUDIO_FILES.street)),
    birds: toPublicAudioSrc(pickRandom(AUDIO_FILES.birds)),
  }));

  const [playingKind, setPlayingKind] = useState<AudioKind | null>(null);

  useEffect(() => {
    setAudioSrcByKind({
      speechJessica: toPublicAudioSrc(pickRandom(AUDIO_FILES.speechJessica)),
      speechMark: toPublicAudioSrc(pickRandom(AUDIO_FILES.speechMark)),
      street: toPublicAudioSrc(pickRandom(AUDIO_FILES.street)),
      birds: toPublicAudioSrc(pickRandom(AUDIO_FILES.birds)),
    });
    setPlayingKind(null);
  }, [activeLevel]);

  useEffect(() => {
    const prev = prevScreenRef.current;
    prevScreenRef.current = screen;

    // When leaving the level view (back to menu/overview), stop any playback
    // but keep progress in-memory. The unified player's <audio> unmounts with
    // the level UI, so engine.stop() is enough to kill any active routing.
    if (prev === "level" && screen !== "level") {
      engine.stop();
      toneSeqRef.current += 1;
      toneInFlightRef.current = false;
      setTonePlaying(false);
      setPlayingKind(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  // --- Unified audio player config (used in listen + correct stages) ---
  const unifiedSounds: SoundOption[] = audioKinds.map((kind) => ({
    key: kind,
    label: t[`hearingLossExperience.audioKind.${kind}`],
    loop: AUDIO_LOOP[kind],
  }));

  const unifiedSrcByKey: Record<string, string> = audioKinds.reduce(
    (acc, kind) => ({ ...acc, [kind]: audioSrcByKind[kind] }),
    {}
  );

  const onUnifiedBeforePlay = async (el: HTMLAudioElement, soundKey: string) => {
    setPlayingKind(soundKey as AudioKind);
    if (activeLevel !== "intro") {
      await engine.attachMediaElement(el);
      if (sampledProfileAppliedRef.current) {
        await engine.setProfile(sampledProfileAppliedRef.current, 100);
      }
    }
  };

  // --- Audiogram chart (draggable points vertical-only) ---

  const svgW = 720;
  const svgH = 480;
  const padLeft = 56;
  const padRight = 128;
  const padTop = 24;
  const padBottom = 36;
  const innerW = svgW - padLeft - padRight;
  const innerH = svgH - padTop - padBottom;

  // Add a little breathing room at the ends of the X axis (250 Hz and 8 kHz).
  const xInset = 18;
  const xForIndex = (idx: number) => {
    const n = TEST_FREQUENCIES_HZ.length;
    const x0 = padLeft + xInset;
    const x1 = padLeft + innerW - xInset;
    return x0 + ((x1 - x0) * idx) / Math.max(1, n - 1);
  };
  const yForValue = (val: number) => padTop + (innerH * clamp(val, 0, 100)) / 100;
  const valueForY = (y: number) => ((clamp(y, padTop, padTop + innerH) - padTop) / innerH) * 100;

  const yValueForDbHl = (dbHl: number) => clamp(((dbHl - DBHL_MIN) / DBHL_RANGE) * 100, 0, 100);
  const dbHlForYValue = (yVal: number) => DBHL_MIN + (clamp(yVal, 0, 100) / 100) * DBHL_RANGE;

  const RIGHT_MARKER_R = 6;
  const LEFT_MARKER_HALF = 6;
  const LEFT_MARKER_R = Math.SQRT2 * LEFT_MARKER_HALF;
  const MARKER_GAP_PX = 3;
  const RIGHT_DRAG_HIT_R = RIGHT_MARKER_R + 16;
  const LEFT_DRAG_HIT_R = 18;

  const shortenSegment = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    shortenStartPx: number,
    shortenEndPx: number
  ) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len <= shortenStartPx + shortenEndPx + 0.001) return null;
    const ux = dx / len;
    const uy = dy / len;
    return {
      x1: x1 + ux * shortenStartPx,
      y1: y1 + uy * shortenStartPx,
      x2: x2 - ux * shortenEndPx,
      y2: y2 - uy * shortenEndPx,
    };
  };

  const [dragTarget, setDragTarget] = useState<{ ear: Ear; freqHz: number } | null>(null);
  const dragPointerIdRef = useRef<number | null>(null);
  const dragCaptureRef = useRef<SVGElement | null>(null);

  useEffect(() => {
    if (!dragTarget) return;

    const preventTouchScroll = (e: TouchEvent) => {
      e.preventDefault();
    };

    // Keep the active drag gesture from being handed off to page scrolling
    // on mobile browsers that are less reliable with SVG touch-action.
    document.addEventListener("touchmove", preventTouchScroll, { passive: false });
    return () => {
      document.removeEventListener("touchmove", preventTouchScroll);
    };
  }, [dragTarget]);

  // Map draggable audiogram points to per-frequency EQ in dB.
  const correctionEqByEar = useMemo(() => {
    if (activeStage !== "correct") return null;
    if (activeLevel === "intro") return null;

    const measuredRightByHz: Record<number, number> = {};
    for (const p of measuredPointsRight) measuredRightByHz[p.freqHz] = p.y;
    const measuredLeftByHz: Record<number, number> = {};
    for (const p of measuredPointsLeft) measuredLeftByHz[p.freqHz] = p.y;

    const outRight: Record<number, number> = {};
    const outLeft: Record<number, number> = {};

    // The chart y-axis is displayed as an approximate dB HL scale.
    // Map adjustments in that displayed scale to EQ gain changes.
    // Use a conservative "half-gain" rule to avoid huge boosts.
    const GAIN_PER_DBHL = 0.5;
    // Keep correction within a safer range to avoid clipping/static when users
    // drag points aggressively (this is an educational prototype, not a real hearing aid).
    const MAX_BOOST_DB = 18;
    const MAX_CUT_DB = 12;
    for (const f of TEST_FREQUENCIES_HZ) {
      const measuredRY = measuredRightByHz[f];
      const adjustedRY = adjustedRight[f]?.y;
      if (typeof measuredRY === "number" && typeof adjustedRY === "number") {
        const measuredDbHl = dbHlForYValue(measuredRY);
        const adjustedDbHl = dbHlForYValue(adjustedRY);
        const diffDbHl = measuredDbHl - adjustedDbHl;
        const db = clamp(diffDbHl * GAIN_PER_DBHL, -MAX_CUT_DB, MAX_BOOST_DB);
        if (Math.abs(db) > 0.01) outRight[f] = db;
      }

      const measuredLY = measuredLeftByHz[f];
      const adjustedLY = adjustedLeft[f]?.y;
      if (typeof measuredLY === "number" && typeof adjustedLY === "number") {
        const measuredDbHl = dbHlForYValue(measuredLY);
        const adjustedDbHl = dbHlForYValue(adjustedLY);
        const diffDbHl = measuredDbHl - adjustedDbHl;
        const db = clamp(diffDbHl * GAIN_PER_DBHL, -MAX_CUT_DB, MAX_BOOST_DB);
        if (Math.abs(db) > 0.01) outLeft[f] = db;
      }
    }

    return { left: outLeft, right: outRight };
  }, [activeStage, activeLevel, adjustedRight, adjustedLeft, measuredPointsRight, measuredPointsLeft]);

  const correctionParams = useMemo(() => {
    if (activeStage !== "correct") return null;
    if (activeLevel === "intro") return null;
    if (!correctionEqByEar) return null;

    return {
      eqByHzDbByEar: correctionEqByEar,
      compressionAmount: 70,
      leftEarAttenuation: muteAdjustLeft ? 96 : 0,
      rightEarAttenuation: muteAdjustRight ? 96 : 0,
      // Speech clips are often mono or left-heavy; in per-ear split mode that can
      // make the right ear sound very low. Force dual-mono only for speech.
      forceDualMono: playingKind === "speechJessica" || playingKind === "speechMark",
    };
  }, [activeStage, activeLevel, correctionEqByEar, playingKind, muteAdjustLeft, muteAdjustRight]);

  useEffect(() => {
    engine.setCorrection(correctionParams);
  }, [correctionParams]);

  const onAdjustPointerDown = (adjustEar: Ear, freqHz: number) => (e: React.PointerEvent<SVGElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget;
    target.setPointerCapture?.(e.pointerId);
    dragPointerIdRef.current = e.pointerId;
    dragCaptureRef.current = target;
    setDragTarget({ ear: adjustEar, freqHz });
  };

  const onPointPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragTarget) return;
    if (dragPointerIdRef.current !== null && e.pointerId !== dragPointerIdRef.current) return;
    e.preventDefault();
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const scaleY = svgH / rect.height;
    const localY = (e.clientY - rect.top) * scaleY;
    const nextVal = valueForY(localY);

    const setForEar = dragTarget.ear === "R" ? setAdjustedRight : setAdjustedLeft;
    setForEar((prev) => {
      const p = prev[dragTarget.freqHz];
      if (!p) return prev;
      return { ...prev, [dragTarget.freqHz]: { ...p, y: clamp(nextVal, 0, 100) } };
    });
  };

  const onPointPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragTarget) return;
    if (dragPointerIdRef.current !== null && e.pointerId !== dragPointerIdRef.current) return;
    e.preventDefault();
    setDragTarget(null);
    if (dragCaptureRef.current && dragPointerIdRef.current !== null) {
      dragCaptureRef.current.releasePointerCapture?.(dragPointerIdRef.current);
    }
    dragPointerIdRef.current = null;
    dragCaptureRef.current = null;
  };

  const onAdjustKeyDown = (adjustEar: Ear, freqHz: number) => (e: React.KeyboardEvent<SVGElement>) => {
    if (activeStage !== "correct") return;
    const delta = e.key === "ArrowUp" ? -2 : e.key === "ArrowDown" ? 2 : 0;
    if (delta === 0) return;
    e.preventDefault();
    const setForEar = adjustEar === "R" ? setAdjustedRight : setAdjustedLeft;
    setForEar((prev) => {
      const p = prev[freqHz];
      if (!p) return prev;
      return { ...prev, [freqHz]: { ...p, y: clamp(p.y + delta, 0, 100) } };
    });
  };

  const audiogramTitle =
    activeStage === "correct" ? t["hearingLossExperience.audiogram.adjustTitle"] : t["hearingLossExperience.audiogram.title"];

  const isInLevel = screen === "level";

  const renderAudiogramSvg = (mode: "both" | Ear) => {
    const showRight = mode === "both" || mode === "R";
    const showLeft = mode === "both" || mode === "L";
    const showAdjust = activeStage === "correct" && mode !== "both";

    const DBHL_TICKS = Array.from({ length: Math.floor((DBHL_MAX - DBHL_MIN) / 10) + 1 }, (_, i) => DBHL_MIN + i * 10);
    const LOSS_BANDS: Array<{ key: string; min: number; max: number }> = [
      { key: "hearingLossExperience.audiogram.scale.normal", min: -10, max: 25 },
      { key: "hearingLossExperience.audiogram.scale.mild", min: 25, max: 40 },
      { key: "hearingLossExperience.audiogram.scale.moderate", min: 40, max: 55 },
      { key: "hearingLossExperience.audiogram.scale.moderatelySevere", min: 55, max: 70 },
      { key: "hearingLossExperience.audiogram.scale.severe", min: 70, max: 90 },
      { key: "hearingLossExperience.audiogram.scale.profound", min: 90, max: 120 },
    ];

    const rightPlotX = padLeft + innerW;
    // Right-side severity scale layout (keep labels tight to the right edge).
    const plotToScaleGap = 30;
    const scaleLineX = Math.min(svgW - 40, rightPlotX + plotToScaleGap);
    const scaleNotchLen = 10;
    const rightEdgeX = svgW - 10;
    const rightLabelPad = 15;
    const rightLabelX = Math.min(rightEdgeX, scaleLineX + scaleNotchLen + rightLabelPad);
    const dbLabelForY = (yVal: number) => Math.round(dbHlForYValue(yVal));

    const scaleBoundariesDb = Array.from(
      new Set([
        ...LOSS_BANDS.map((b) => b.min),
        ...(LOSS_BANDS.length ? [LOSS_BANDS[LOSS_BANDS.length - 1]!.max] : []),
      ])
    ).sort((a, b) => a - b);

    const plotYForThreshold = (th: number | null) => (th === null ? yForValue(100) : yForValue(levelToY(th)));

    return (
      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="h-auto w-full"
        role="img"
        aria-label={
          mode === "both"
            ? t["hearingLossExperience.audiogram.aria"]
            : `${t["hearingLossExperience.audiogram.aria"]} ${mode === "R" ? t["hearingLossExperience.test.earRight"] : t["hearingLossExperience.test.earLeft"]}`
        }
        onPointerMove={onPointPointerMove}
        onPointerUp={onPointPointerUp}
        onPointerCancel={onPointPointerUp}
      >
        {/* Grid + left axis labels (approx. dB HL) */}
        {DBHL_TICKS.map((db) => {
          const y = yForValue(yValueForDbHl(db));
          return (
            <g key={db}>
              <line x1={padLeft} x2={rightPlotX} y1={y} y2={y} stroke={svgGrid} strokeWidth="1" />
              <text x={padLeft - 10} y={y + 4} fill={svgLabelDim} fontSize="11" textAnchor="end">
                {db}
              </text>
            </g>
          );
        })}

        {/* Vertical grid lines (frequency ticks) */}
        {TEST_FREQUENCIES_HZ.map((f, idx) => {
          const x = xForIndex(idx);
          return <line key={`grid-x-${f}`} x1={x} x2={x} y1={padTop} y2={padTop + innerH} stroke={svgGrid} strokeWidth="1" />;
        })}

        {/* Right-side scale (hearing loss categories) */}
        <line x1={scaleLineX} x2={scaleLineX} y1={padTop} y2={padTop + innerH} stroke={svgGrid} strokeWidth="1" />
        {scaleBoundariesDb.map((db) => {
          const y = yForValue(yValueForDbHl(db));
          return (
            <line
              key={`scale-notch-${db}`}
              x1={scaleLineX - scaleNotchLen}
              x2={scaleLineX + scaleNotchLen}
              y1={y}
              y2={y}
              stroke={svgGrid}
              strokeWidth="1"
            />
          );
        })}
        {LOSS_BANDS.map((b) => {
          const midDb = (b.min + b.max) / 2;
          const y = yForValue(yValueForDbHl(midDb));
          return (
            <text key={b.key} x={rightLabelX} y={y + 4} fill={svgLabelMid} fontSize="10" textAnchor="start">
              {t[b.key]}
            </text>
          );
        })}

        {/* X labels */}
        {TEST_FREQUENCIES_HZ.map((f, idx) => (
          <text key={f} x={xForIndex(idx)} y={svgH - 12} fill={svgLabelMid} fontSize="11" textAnchor="middle">
            {f >= 1000 ? `${f / 1000} ${t["common.khz"]}` : `${f} ${t["common.hz"]}`}
          </text>
        ))}

        {/* Measured points */}
        {showRight &&
          TEST_FREQUENCIES_HZ.slice(0, -1).map((f1, i) => {
            const f2 = TEST_FREQUENCIES_HZ[i + 1];
            if (!f2) return null;

            const th1 = audiometry.right.thresholds_by_hz[f1];
            const th2 = audiometry.right.thresholds_by_hz[f2];
            if (th1 === undefined || th2 === undefined) return null;

            const x1 = xForIndex(i);
            const x2 = xForIndex(i + 1);
            const y1Base = plotYForThreshold(th1);
            const y2Base = plotYForThreshold(th2);

            const LINE_STROKE_W = 2;
            const OVERLAP_OFFSET_PX = LINE_STROKE_W * 0.75;
            const OVERLAP_EPS_PX = 1.5;

            let ox = 0;
            let oy = 0;
            if (mode === "both" && showLeft) {
              const l1 = audiometry.left.thresholds_by_hz[f1];
              const l2 = audiometry.left.thresholds_by_hz[f2];
              if (l1 !== undefined && l2 !== undefined) {
                const ly1 = plotYForThreshold(l1);
                const ly2 = plotYForThreshold(l2);
                const overlap = Math.abs(ly1 - y1Base) <= OVERLAP_EPS_PX && Math.abs(ly2 - y2Base) <= OVERLAP_EPS_PX;
                if (overlap) {
                  const dx = x2 - x1;
                  const dy = y2Base - y1Base;
                  const len = Math.hypot(dx, dy);
                  // Unit normal to the segment.
                  let nx = len > 0.0001 ? -dy / len : 0;
                  let ny = len > 0.0001 ? dx / len : -1;
                  // Ensure the normal points upward (negative y) so red is "above" blue.
                  if (ny > 0) {
                    nx = -nx;
                    ny = -ny;
                  }
                  ox = nx * OVERLAP_OFFSET_PX;
                  oy = ny * OVERLAP_OFFSET_PX;
                }
              }
            }

            const x1Off = x1 + ox;
            const y1Off = y1Base + oy;
            const x2Off = x2 + ox;
            const y2Off = y2Base + oy;

            const pad1 = LEFT_MARKER_R + MARKER_GAP_PX;
            const pad2 = LEFT_MARKER_R + MARKER_GAP_PX;
            const seg = shortenSegment(x1Off, y1Off, x2Off, y2Off, pad1, pad2);
            if (!seg) return null;
            return (
              <line
                key={`line-r-${f1}-${f2}`}
                x1={seg.x1}
                y1={seg.y1}
                x2={seg.x2}
                y2={seg.y2}
                stroke="#f87171"
                strokeWidth="2"
                strokeLinecap="round"
              />
            );
          })}
        {showLeft &&
          TEST_FREQUENCIES_HZ.slice(0, -1).map((f1, i) => {
            const f2 = TEST_FREQUENCIES_HZ[i + 1];
            if (!f2) return null;

            const th1 = audiometry.left.thresholds_by_hz[f1];
            const th2 = audiometry.left.thresholds_by_hz[f2];
            if (th1 === undefined || th2 === undefined) return null;

            const x1 = xForIndex(i);
            const x2 = xForIndex(i + 1);
            const y1Base = plotYForThreshold(th1);
            const y2Base = plotYForThreshold(th2);

            const LINE_STROKE_W = 2;
            const OVERLAP_OFFSET_PX = LINE_STROKE_W * 0.75;
            const OVERLAP_EPS_PX = 1.5;

            let ox = 0;
            let oy = 0;
            if (mode === "both" && showRight) {
              const r1 = audiometry.right.thresholds_by_hz[f1];
              const r2 = audiometry.right.thresholds_by_hz[f2];
              if (r1 !== undefined && r2 !== undefined) {
                const ry1 = plotYForThreshold(r1);
                const ry2 = plotYForThreshold(r2);
                const overlap = Math.abs(ry1 - y1Base) <= OVERLAP_EPS_PX && Math.abs(ry2 - y2Base) <= OVERLAP_EPS_PX;
                if (overlap) {
                  const dx = x2 - x1;
                  const dy = y2Base - y1Base;
                  const len = Math.hypot(dx, dy);
                  let nx = len > 0.0001 ? -dy / len : 0;
                  let ny = len > 0.0001 ? dx / len : -1;
                  if (ny > 0) {
                    nx = -nx;
                    ny = -ny;
                  }
                  // Blue goes to the opposite side of red.
                  ox = -nx * OVERLAP_OFFSET_PX;
                  oy = -ny * OVERLAP_OFFSET_PX;
                }
              }
            }

            const x1Off = x1 + ox;
            const y1Off = y1Base + oy;
            const x2Off = x2 + ox;
            const y2Off = y2Base + oy;

            const pad1 = LEFT_MARKER_R + MARKER_GAP_PX;
            const pad2 = LEFT_MARKER_R + MARKER_GAP_PX;
            const seg = shortenSegment(x1Off, y1Off, x2Off, y2Off, pad1, pad2);
            if (!seg) return null;

            return (
              <line
                key={`line-l-${f1}-${f2}`}
                x1={seg.x1}
                y1={seg.y1}
                x2={seg.x2}
                y2={seg.y2}
                stroke="#60a5fa"
                strokeWidth="2"
                strokeLinecap="round"
              />
            );
          })}

        {showRight &&
          TEST_FREQUENCIES_HZ.map((f, idx) => {
            const th = audiometry.right.thresholds_by_hz[f];
            if (th === undefined) return null;
            const cx = xForIndex(idx);
            const cy = plotYForThreshold(th);
            if (th === null) {
              const bothNr = mode === "both" && audiometry.left.thresholds_by_hz[f] === null;
              const ARROW_X_OFFSET_PX = 2.5;
              const ARROW_FONT_SIZE_PX = 14;
              const x = cx + (bothNr ? -ARROW_X_OFFSET_PX : 0);
              return (
                <text
                  key={`m-r-${f}`}
                  x={x}
                  y={cy}
                  fill="#f87171"
                  fontSize={ARROW_FONT_SIZE_PX}
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  ↓
                </text>
              );
            }
            return <circle key={`m-r-${f}`} cx={cx} cy={cy} r={RIGHT_MARKER_R} fill="#f87171" />;
          })}
        {showLeft &&
          TEST_FREQUENCIES_HZ.map((f, idx) => {
            const th = audiometry.left.thresholds_by_hz[f];
            if (th === undefined) return null;
            const cx = xForIndex(idx);
            const cy = plotYForThreshold(th);
            const s = LEFT_MARKER_HALF;
            if (th === null) {
              const bothNr = mode === "both" && audiometry.right.thresholds_by_hz[f] === null;
              const ARROW_X_OFFSET_PX = 2.5;
              const ARROW_FONT_SIZE_PX = 14;
              const x = cx + (bothNr ? ARROW_X_OFFSET_PX : 0);
              return (
                <text
                  key={`m-l-${f}`}
                  x={x}
                  y={cy}
                  fill="#60a5fa"
                  fontSize={ARROW_FONT_SIZE_PX}
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  ↓
                </text>
              );
            }
            return (
              <g key={`m-l-${f}`} stroke="#60a5fa" strokeWidth="2">
                <line x1={cx - s} y1={cy - s} x2={cx + s} y2={cy + s} />
                <line x1={cx - s} y1={cy + s} x2={cx + s} y2={cy - s} />
              </g>
            );
          })}

        {/* Adjusted (draggable) overlays */}
        {showAdjust && mode === "R" && (
          <>
            {TEST_FREQUENCIES_HZ.map((f) => {
              const idx = TEST_FREQUENCIES_HZ.findIndex((hz) => hz === f);
              const cx = xForIndex(idx);
              const measuredR = measuredPointsRight.find((p) => p.freqHz === f);
              const adjustedR = adjustedRight[f];
              if (!measuredR || !adjustedR) return null;
              const y1 = yForValue(adjustedR.y);
              const y2 = yForValue(measuredR.y);
              const seg = shortenSegment(cx, y1, cx, y2, RIGHT_MARKER_R + 2 + MARKER_GAP_PX, RIGHT_MARKER_R + MARKER_GAP_PX);
              if (!seg) return null;
              return (
                <line
                  key={`guide-r-${f}`}
                  x1={seg.x1}
                  y1={seg.y1}
                  x2={seg.x2}
                  y2={seg.y2}
                  stroke="#f87171"
                  strokeWidth="2"
                  strokeDasharray="3 3"
                  strokeLinecap="round"
                  opacity="0.6"
                />
              );
            })}

            {adjustedPointsRight.map((p) => {
              const idx = TEST_FREQUENCIES_HZ.findIndex((f) => f === p.freqHz);
              const cx = xForIndex(idx);
              const cy = yForValue(p.y);
              const dbhl = dbLabelForY(p.y);
              return (
                <g
                  key={`adj-r-${p.freqHz}`}
                  tabIndex={0}
                  role="slider"
                  aria-label={`${t["hearingLossExperience.test.earRight"]} ${t["hearingLossExperience.audiogram.point"]} ${p.freqHz} ${t["common.hz"]}`}
                  aria-valuemin={DBHL_MIN}
                  aria-valuemax={DBHL_MAX}
                  aria-valuenow={dbhl}
                  onKeyDown={onAdjustKeyDown("R", p.freqHz)}
                >
                  <circle
                    cx={cx}
                    cy={cy}
                    r={RIGHT_MARKER_R + 2}
                    fill="transparent"
                    stroke="#f87171"
                    strokeWidth="3"
                    opacity="0.55"
                    pointerEvents="none"
                  />
                  <circle
                    cx={cx}
                    cy={cy}
                    r={RIGHT_DRAG_HIT_R}
                    fill="transparent"
                    stroke="none"
                    pointerEvents="all"
                    style={{ touchAction: "none" }}
                    onPointerDown={onAdjustPointerDown("R", p.freqHz)}
                    onTouchStart={(e) => e.preventDefault()}
                  />
                </g>
              );
            })}
          </>
        )}

        {showAdjust && mode === "L" && (
          <>
            {TEST_FREQUENCIES_HZ.map((f) => {
              const idx = TEST_FREQUENCIES_HZ.findIndex((hz) => hz === f);
              const cx = xForIndex(idx);
              const measuredL = measuredPointsLeft.find((p) => p.freqHz === f);
              const adjustedL = adjustedLeft[f];
              if (!measuredL || !adjustedL) return null;
              const y1 = yForValue(adjustedL.y);
              const y2 = yForValue(measuredL.y);
              const seg = shortenSegment(cx, y1, cx, y2, LEFT_MARKER_R + 2 + MARKER_GAP_PX, LEFT_MARKER_R + MARKER_GAP_PX);
              if (!seg) return null;
              return (
                <line
                  key={`guide-l-${f}`}
                  x1={seg.x1}
                  y1={seg.y1}
                  x2={seg.x2}
                  y2={seg.y2}
                  stroke="#60a5fa"
                  strokeWidth="2"
                  strokeDasharray="3 3"
                  strokeLinecap="round"
                  opacity="0.6"
                />
              );
            })}

            {adjustedPointsLeft.map((p) => {
              const idx = TEST_FREQUENCIES_HZ.findIndex((f) => f === p.freqHz);
              const cx = xForIndex(idx);
              const cy = yForValue(p.y);
              const s = LEFT_MARKER_HALF + 1;
              const dbhl = dbLabelForY(p.y);
              return (
                <g
                  key={`adj-l-${p.freqHz}`}
                  stroke="#60a5fa"
                  strokeWidth="3"
                  opacity="0.55"
                  tabIndex={0}
                  role="slider"
                  aria-label={`${t["hearingLossExperience.test.earLeft"]} ${t["hearingLossExperience.audiogram.point"]} ${p.freqHz} ${t["common.hz"]}`}
                  aria-valuemin={DBHL_MIN}
                  aria-valuemax={DBHL_MAX}
                  aria-valuenow={dbhl}
                  onKeyDown={onAdjustKeyDown("L", p.freqHz)}
                >
                  <line x1={cx - s} y1={cy - s} x2={cx + s} y2={cy + s} pointerEvents="none" />
                  <line x1={cx - s} y1={cy + s} x2={cx + s} y2={cy - s} pointerEvents="none" />
                  <circle
                    cx={cx}
                    cy={cy}
                    r={LEFT_DRAG_HIT_R}
                    fill="transparent"
                    stroke="none"
                    pointerEvents="all"
                    style={{ touchAction: "none" }}
                    onPointerDown={onAdjustPointerDown("L", p.freqHz)}
                    onTouchStart={(e) => e.preventDefault()}
                  />
                </g>
              );
            })}
          </>
        )}
      </svg>
    );
  };

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
      {screen === "landing" ? (
        // --- Landing: choose a mode -----------------------------------------------
        <div className="space-y-6">
          <section className="rounded-2xl border border-surface-300 bg-white shadow-sm p-5 sm:p-6">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t["hearingLossExperience.menu.title"]}</h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-500">{t["hearingLossExperience.landing.headerBody"]}</p>
          </section>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Hear & compare */}
            <button
              type="button"
              onClick={goToCompare}
              className="group flex flex-col items-center gap-4 rounded-2xl border border-surface-300 bg-white shadow-sm p-6 text-center hover:bg-surface-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steps-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-100 sm:min-h-80 sm:justify-center sm:p-10"
            >
              <img
                src="/icons/listen 512x512.png"
                alt=""
                className="h-20 w-20 object-contain brightness-0 opacity-90 transition-opacity group-hover:opacity-100 sm:h-24 sm:w-24"
              />
              <div>
                <div className="text-base font-semibold text-gray-800 sm:text-lg">
                  {t["hearingLossExperience.landing.compareTitle"]}
                </div>
                <div className="mt-2 text-sm text-gray-500">
                  {t["hearingLossExperience.landing.compareBody"]}
                </div>
              </div>
            </button>

            {/* Live microphone mode */}
            <button
              type="button"
              onClick={goToLiveMode}
              className="group flex flex-col items-center gap-4 rounded-2xl border border-surface-300 bg-white shadow-sm p-6 text-center hover:bg-surface-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steps-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-100 sm:min-h-80 sm:justify-center sm:p-10"
            >
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-steps-50 text-steps-600 transition group-hover:bg-steps-100 sm:h-24 sm:w-24">
                <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.93V21h2v-3.07A7 7 0 0 0 19 11h-2Z" />
                </svg>
              </div>
              <div>
                <div className="text-base font-semibold text-gray-800 sm:text-lg">
                  {t["hearingLossExperience.landing.liveTitle"]}
                </div>
                <div className="mt-2 text-sm text-gray-500">
                  {t["hearingLossExperience.landing.liveBody"]}
                </div>
              </div>
            </button>

            {/* Full experience */}
            <button
              type="button"
              onClick={goToExperienceMenu}
              className="group flex flex-col items-center gap-4 rounded-2xl border border-surface-300 bg-white shadow-sm p-6 text-center hover:bg-surface-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steps-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-100 sm:min-h-80 sm:justify-center sm:p-10"
            >
              <img
                src="/icons/audiogram 512x512.png"
                alt=""
                className="h-20 w-20 object-contain brightness-0 opacity-90 transition-opacity group-hover:opacity-100 sm:h-24 sm:w-24"
              />
              <div>
                <div className="text-base font-semibold text-gray-800 sm:text-lg">
                  {t["hearingLossExperience.landing.experienceTitle"]}
                </div>
                <div className="mt-2 text-sm text-gray-500">
                  {t["hearingLossExperience.landing.experienceBody"]}
                </div>
              </div>
            </button>
          </div>
        </div>
      ) : screen === "live" ? (
        // --- Live microphone mode -----------------------------------------------
        <div className="space-y-6">
          <section className="rounded-2xl border border-surface-300 bg-white shadow-sm p-5 sm:p-6">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              {t["hearingLossExperience.live.title"]}
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-500">
              {t["hearingLossExperience.live.body"]}
            </p>
          </section>

          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950 shadow-sm sm:p-6">
            <div className="text-sm font-semibold uppercase tracking-widest text-amber-700">
              {t["hearingLossExperience.live.warningTitle"]}
            </div>
            <div className="mt-2 text-sm leading-relaxed">
              {t["hearingLossExperience.live.warningBody"]}
            </div>
            <div className="mt-3 rounded-xl border border-amber-200 bg-white/70 p-4 text-sm font-medium text-amber-900">
              {t["hearingLossExperience.live.headphonesNote"]}
            </div>
          </section>

          <section className="rounded-2xl border border-surface-300 bg-white p-5 shadow-sm sm:p-6">
            <div className="text-sm font-semibold uppercase tracking-widest text-gray-500">
              {t["hearingLossExperience.live.profileLabel"]}
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {LIVE_PROFILES.map(({ id, titleKey, subtitleKey }) => {
                const active = liveProfileId === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setLiveProfileId(id)}
                    aria-pressed={active}
                    className={
                      "rounded-xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steps-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white " +
                      (active ? "border-steps-400 bg-steps-50" : "border-surface-300 bg-white hover:bg-surface-50")
                    }
                  >
                    <div className="font-semibold text-gray-800">{t[titleKey]}</div>
                    <div className="mt-1 text-sm text-gray-500">{t[subtitleKey]}</div>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={startLiveMonitoring}
                disabled={liveStatus === "starting" || liveStatus === "running"}
                className="rounded-lg border border-steps-300 bg-steps-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-steps-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {liveStatus === "starting" ? t["hearingLossExperience.live.starting"] : t["hearingLossExperience.live.start"]}
              </button>
              <button
                type="button"
                onClick={stopLiveMonitoring}
                disabled={liveStatus === "idle"}
                className="rounded-lg border border-surface-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-surface-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {t["hearingLossExperience.live.stop"]}
              </button>
              <button
                type="button"
                onClick={goToLanding}
                className="rounded-lg border border-surface-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-surface-100"
              >
                {t["hearingLossExperience.live.back"]}
              </button>
            </div>

            <div className="mt-4 text-sm text-gray-500">
              {liveStatus === "running"
                ? t["hearingLossExperience.live.statusRunning"]
                : liveStatus === "starting"
                  ? t["hearingLossExperience.live.statusStarting"]
                  : t["hearingLossExperience.live.statusIdle"]}
            </div>

            {liveError && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                {liveError}
              </div>
            )}
          </section>
        </div>
      ) : screen === "compare" ? (
        // --- Compare dashboard ---------------------------------------------------
        <HearingLossCompare />
      ) : !isInLevel ? (
        // --- Experience menu (minimal) -------------------------------------------
        <div className="space-y-6">
          <section className="rounded-2xl border border-surface-300 bg-white shadow-sm p-5 sm:p-6">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t["hearingLossExperience.menu.title"]}</h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-500">{t["hearingLossExperience.menu.body"]}</p>
          </section>

          <section className="rounded-2xl border border-surface-300 bg-white shadow-sm p-5 sm:p-6">
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => startLevel("intro")}
                className="w-full rounded-xl border border-surface-300 bg-white px-4 py-4 text-left hover:bg-surface-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steps-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-100"
              >
                <div className="text-base font-semibold">{t["hearingLossExperience.menu.introCta"]}</div>
                <div className="mt-1 text-sm text-gray-500">{t["hearingLossExperience.level.intro.subtitle"]}</div>
              </button>

              <div className="pt-2">
                <div className="text-sm font-semibold">{t["hearingLossExperience.menu.levelsTitle"]}</div>
                <div className="mt-3 space-y-2">
                  {levels
                    .filter((l) => l.id !== "intro")
                    .map((lvl) => {
                      const locked = isLocked(lvl.id);
                      const completed = completedLevels.includes(lvl.id);
                      const hideLabels = HIDE_HEARING_LOSS_PROFILE_LABELS && !completed;
                      const title = hideLabels ? t["hearingLossExperience.level.hidden.title"] : t[lvl.titleKey];
                      const subtitle = hideLabels ? t["hearingLossExperience.level.hidden.subtitle"] : t[lvl.subtitleKey];
                      return (
                        <button
                          key={lvl.id}
                          type="button"
                          onClick={() => startLevel(lvl.id)}
                          disabled={locked}
                          aria-disabled={locked}
                          className={
                            "w-full rounded-xl border border-surface-300 px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steps-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-100 " +
                            (locked ? "cursor-not-allowed opacity-60" : "hover:bg-surface-100")
                          }
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-semibold">{title}</div>
                              <div className="mt-0.5 text-xs text-gray-500">{subtitle}</div>
                            </div>
                            {completed && (
                              <span className="rounded-full border border-surface-300 px-2 py-1 text-xs text-gray-600">
                                {t["hearingLossExperience.badge.completed"]}
                              </span>
                            )}
                            {locked && (
                              <span className="rounded-full border border-surface-300 px-2 py-1 text-xs text-gray-600">
                                {t["hearingLossExperience.badge.locked"]}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : (
        // --- Level flow (minimal, step-based) ---
        <div className="space-y-6">
          <section className="rounded-2xl border border-surface-300 bg-white shadow-sm p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{visibleLevelTitle}</h1>
                <p className="mt-1 text-sm text-gray-500">{visibleLevelSubtitle}</p>
              </div>

              <div className="flex items-center gap-2">
                {stagesForLevel.map((s) => (
                  <span
                    key={s}
                    className={
                      "rounded-full border px-2 py-1 text-xs " +
                      (normalizedStage === s ? "border-steps-300 text-gray-700" : "border-surface-300 text-gray-400")
                    }
                  >
                    {t[`hearingLossExperience.stage.${s}`]}
                  </span>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-surface-300 bg-white shadow-sm p-5 sm:p-6">
            {normalizedStage === "listen" && (
              <div className="space-y-4">
                <div className="text-sm text-gray-500">{t["hearingLossExperience.listen.body"]}</div>

                <details className="rounded-xl border border-surface-300 bg-surface-50 p-4">
                  <summary className="cursor-pointer text-sm font-medium text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steps-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-100">
                    {t["hearingLossExperience.guide.title"]}
                  </summary>
                  <div className="mt-3 text-sm text-gray-500">{t["hearingLossExperience.guide.notDb"]}</div>
                  <div className="mt-2 text-sm text-gray-500">{t["hearingLossExperience.guide.listenTips"]}</div>
                </details>

                <UnifiedAudioPlayer
                  sounds={unifiedSounds}
                  audioSrcByKey={unifiedSrcByKey}
                  onBeforePlay={onUnifiedBeforePlay}
                  playLabel={t["play"]}
                  pauseLabel={t["pause"]}
                  stopLabel={t["stop"]}
                  soundLabel={t["hearingLossExperience.unifiedPlayer.soundLabel"]}
                  ariaLabel={t["hearingLossExperience.audioPlayerLabel"]}
                />

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setStage("test")}
                    className="rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm font-medium hover:bg-surface-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steps-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-100"
                  >
                    {t["hearingLossExperience.proceed"]}
                  </button>
                </div>
              </div>
            )}

            {normalizedStage === "test" && (
              <div className="-m-5 sm:-m-6">
                <div className="space-y-5 pb-16 p-5 sm:p-6">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                          {t["hearingLossExperience.test.progress"]}
                        </div>
                        <div className="mt-0.5 text-base font-semibold text-gray-800" aria-live="polite">
                          {progressNow} / {totalTestSteps}
                        </div>
                      </div>
                    </div>

                    <div className="h-2 w-full rounded-full bg-surface-200" aria-hidden="true">
                      <div className="h-2 rounded-full bg-steps-400" style={{ width: `${progressPct}%` }} />
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-surface-300 bg-surface-50 p-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                          {t["hearingLossExperience.test.currentEar"]}
                        </div>
                        <div className="mt-1 text-lg font-semibold text-gray-800">
                          {ear === "R" ? t["hearingLossExperience.test.earRight"] : t["hearingLossExperience.test.earLeft"]}
                        </div>
                      </div>

                      <div className="rounded-xl border border-surface-300 bg-surface-50 p-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                          {t["hearingLossExperience.test.currentFreq"]}
                        </div>
                        <div className="mt-1 text-lg font-semibold text-gray-800">
                          {currentFreq} {t["common.hz"]}
                        </div>
                      </div>
                    </div>

                    <div className="text-sm text-gray-500">{t["hearingLossExperience.test.body"]}</div>
                  </div>

                  <div className="rounded-xl border border-surface-300 bg-surface-50 p-4">
                    <LabeledSlider
                      label={t["hearingLossExperience.test.loudnessLabel"]}
                      min={DBHL_MIN}
                      max={DBHL_MAX}
                      step="any"
                      value={sliderDbHlUi}
                      displayValue={Math.round(sliderDbHlUi)}
                      unit={t["hearingLossExperience.test.dbhlUnit"]}
                      showDirectionBars
                      onChange={(v) => {
                        setSliderDbHlUi(v);
                        const roundedDbHl = Math.round(v);
                        const nextLevel = levelForDbHl(roundedDbHl);
                        setSliderLevel(nextLevel);
                        sliderLevelRef.current = nextLevel;
                        setToneError(null);
                      }}
                    />
                    <div className="mt-2 text-xs text-gray-400">
                      {t["hearingLossExperience.test.loudnessHint"]}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setMuted((m) => {
                          const next = !m;
                          if (next) engine.stop();
                          return next;
                        });
                      }}
                      aria-pressed={muted}
                      aria-label={muted ? t["hearingLossExperience.test.resumeTone"] : t["hearingLossExperience.test.pauseTone"]}
                      className={
                        "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steps-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-100 " +
                        (muted
                          ? "border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-500/60 dark:bg-amber-500/10 dark:text-amber-300"
                          : "border-surface-300 bg-white text-gray-700 hover:bg-surface-200")
                      }
                    >
                      {muted ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <rect x="6" y="5" width="4" height="14" rx="1" />
                          <rect x="14" y="5" width="4" height="14" rx="1" />
                        </svg>
                      )}
                      <span>
                        {muted
                          ? t["hearingLossExperience.test.resumeTone"]
                          : t["hearingLossExperience.test.pauseTone"]}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={goToPreviousMeasurement}
                      disabled={ear === "R" && freqIndex === 0}
                      aria-disabled={ear === "R" && freqIndex === 0}
                      className={
                        "rounded-lg border border-surface-300 px-3 py-2 text-sm hover:bg-surface-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steps-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-100 " +
                        (ear === "R" && freqIndex === 0 ? "cursor-not-allowed opacity-60" : "")
                      }
                    >
                      {t["hearingLossExperience.test.previous"]}
                    </button>

                    <button
                      type="button"
                      onClick={clearTestData}
                      className="rounded-lg border border-surface-300 px-3 py-2 text-sm hover:bg-surface-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steps-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-100"
                    >
                      {t["hearingLossExperience.test.clear"]}
                    </button>
                  </div>

                  {muted && (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/60 dark:bg-amber-500/10 dark:text-amber-300">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 shrink-0">
                        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                      <span>{t["hearingLossExperience.test.toneMutedWarning"]}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={continueStep}
                      className="rounded-xl border border-steps-300 bg-steps-50 px-4 py-3 text-sm font-semibold text-gray-800 hover:bg-steps-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steps-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-100"
                    >
                      {t["hearingLossExperience.test.continue"]}
                    </button>

                    <button
                      type="button"
                      onClick={() => void cantHearTone()}
                      className="rounded-xl border border-surface-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-surface-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steps-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-100"
                    >
                      {t["hearingLossExperience.test.cantHear"]}
                    </button>
                  </div>

                  {toneError && <div className="text-sm text-amber-600">{toneError}</div>}

                  <details className="rounded-xl border border-surface-300 bg-surface-50 p-4">
                    <summary className="cursor-pointer text-sm font-medium text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steps-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-100">
                      {t["hearingLossExperience.guide.title"]}
                    </summary>
                    <div className="mt-3 text-sm text-gray-500">{t["hearingLossExperience.guide.scale"]}</div>
                    <div className="mt-2 text-sm text-gray-500">{t["hearingLossExperience.guide.testTips"]}</div>
                  </details>
                </div>

                <div className="sticky bottom-0 rounded-b-2xl border-t border-surface-300 bg-surface-50 px-5 py-4 sm:px-6 sm:py-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <button
                      type="button"
                      onClick={() => setStage("listen")}
                      className="rounded-lg border border-surface-300 px-3 py-2 text-sm hover:bg-surface-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steps-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-100"
                    >
                      {t["hearingLossExperience.back"]}
                    </button>

                    <button
                      type="button"
                      onClick={() => setStage("audiogram")}
                      disabled={!isTestComplete}
                      aria-disabled={!isTestComplete}
                      className={
                        "flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steps-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-100 " +
                        (isTestComplete
                          ? "border-steps-300 bg-steps-50 text-gray-800 hover:bg-steps-100"
                          : "border-surface-300 bg-white text-gray-400 cursor-not-allowed")
                      }
                    >
                      <span>{t["hearingLossExperience.skipToResults"]}</span>
                      <span className="text-xs font-semibold opacity-80">{progressNow}/{totalTestSteps}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {(normalizedStage === "audiogram" || normalizedStage === "correct") && (
              <div className="space-y-5">
                <div>
                  <div className="text-sm font-semibold">{audiogramTitle}</div>
                  <div className="mt-1 text-sm text-gray-500">{t["hearingLossExperience.audiogram.body"]}</div>
                </div>

                {normalizedStage === "audiogram" ? (
                  <div className="rounded-xl border border-surface-300 bg-surface-50 p-4">
                    <div className="text-sm font-medium text-gray-700">{t["hearingLossExperience.guide.title"]}</div>
                    <div className="mt-1 text-sm text-gray-500">{t["hearingLossExperience.guide.audiogramYAxis"]}</div>
                  </div>
                ) : null}

                {normalizedStage === "audiogram" ? (
                  <div className="rounded-xl border border-surface-300 bg-surface-50 p-3">
                    <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-gray-600">
                      <div className="flex items-center gap-2">
                        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                          <circle cx="9" cy="9" r="6" fill="#f87171" />
                        </svg>
                        <span>{t["hearingLossExperience.test.earRight"]}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                          <g stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round">
                            <line x1="4" y1="4" x2="14" y2="14" />
                            <line x1="4" y1="14" x2="14" y2="4" />
                          </g>
                        </svg>
                        <span>{t["hearingLossExperience.test.earLeft"]}</span>
                      </div>
                    </div>
                    {renderAudiogramSvg("both")}
                  </div>
                ) : null}

                {normalizedStage === "audiogram" ? (
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setStage("test")}
                      className="rounded-lg border border-surface-300 px-3 py-2 text-sm hover:bg-surface-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steps-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-100"
                    >
                      {t["hearingLossExperience.back"]}
                    </button>
                    {activeLevel === "intro" ? (
                      <button
                        type="button"
                        onClick={() => {
                          setCompletedLevels((prev) => (prev.includes(activeLevel) ? prev : [...prev, activeLevel]));
                          goToMenu();
                        }}
                        className="rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm font-medium hover:bg-surface-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steps-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-100"
                      >
                        {t["hearingLossExperience.finishLevel"]}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setStage("correct")}
                        className="rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm font-medium hover:bg-surface-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steps-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-100"
                      >
                        {t["hearingLossExperience.proceedToCorrection"]}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <div className="mb-3 text-sm font-medium text-gray-700">{t["hearingLossExperience.correct.listenAgain"]}</div>
                      <UnifiedAudioPlayer
                        sounds={unifiedSounds}
                        audioSrcByKey={unifiedSrcByKey}
                        onBeforePlay={onUnifiedBeforePlay}
                        playLabel={t["play"]}
                        pauseLabel={t["pause"]}
                        stopLabel={t["stop"]}
                        soundLabel={t["hearingLossExperience.unifiedPlayer.soundLabel"]}
                        ariaLabel={t["hearingLossExperience.audioPlayerLabel"]}
                      />
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-xl border border-surface-300 bg-surface-50 p-3">
                        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-gray-600">
                          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                            <circle cx="9" cy="9" r="6" fill="#f87171" />
                          </svg>
                          <span>{t["hearingLossExperience.test.earRight"]}</span>
                        </div>
                        {renderAudiogramSvg("R")}

                        <div className="mt-3">
                          {(() => {
                            const analyser = engine.getEarAnalyser("right") || engine.getAnalyser();
                            return analyser ? (
                              <AudioSpectrum analyser={analyser} height={120} />
                            ) : (
                              <div className="flex h-[120px] items-center justify-center rounded bg-surface-200 text-sm text-gray-400">
                                {t["hearingLossExperience.correct.spectrumPlaceholder"]}
                              </div>
                            );
                          })()}
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setMuteAdjustRight((m) => !m)}
                            aria-pressed={muteAdjustRight}
                            aria-label={
                              muteAdjustRight
                                ? t["hearingLossExperience.correct.unmuteRight"]
                                : t["hearingLossExperience.correct.muteRight"]
                            }
                            className={
                              "flex items-center justify-center rounded-lg border border-surface-300 bg-white px-3 py-2 hover:bg-surface-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steps-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-100 " +
                              (muteAdjustRight ? "opacity-70" : "")
                            }
                          >
                            <img src={muteAdjustRight ? "/icons/unMuteButton2.png" : "/icons/muteButton2.png"} alt="" className="h-5 w-5 brightness-0" />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              const nextR: AdjustedByHz = {};
                              for (const p of measuredPointsRight) nextR[p.freqHz] = { ...p };
                              setAdjustedRight(nextR);
                            }}
                            className="rounded-lg border border-surface-300 px-3 py-2 text-sm hover:bg-surface-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steps-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-100"
                          >
                            {t["hearingLossExperience.correct.resetRight"]}
                          </button>
                        </div>
                      </div>
                      <div className="rounded-xl border border-surface-300 bg-surface-50 p-3">
                        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-gray-600">
                          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                            <g stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round">
                              <line x1="4" y1="4" x2="14" y2="14" />
                              <line x1="4" y1="14" x2="14" y2="4" />
                            </g>
                          </svg>
                          <span>{t["hearingLossExperience.test.earLeft"]}</span>
                        </div>
                        {renderAudiogramSvg("L")}

                        <div className="mt-3">
                          {(() => {
                            const analyser = engine.getEarAnalyser("left") || engine.getAnalyser();
                            return analyser ? (
                              <AudioSpectrum analyser={analyser} height={120} />
                            ) : (
                              <div className="flex h-[120px] items-center justify-center rounded bg-surface-200 text-sm text-gray-400">
                                {t["hearingLossExperience.correct.spectrumPlaceholder"]}
                              </div>
                            );
                          })()}
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setMuteAdjustLeft((m) => !m)}
                            aria-pressed={muteAdjustLeft}
                            aria-label={
                              muteAdjustLeft
                                ? t["hearingLossExperience.correct.unmuteLeft"]
                                : t["hearingLossExperience.correct.muteLeft"]
                            }
                            className={
                              "flex items-center justify-center rounded-lg border border-surface-300 bg-white px-3 py-2 hover:bg-surface-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steps-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-100 " +
                              (muteAdjustLeft ? "opacity-70" : "")
                            }
                          >
                            <img src={muteAdjustLeft ? "/icons/unMuteButton2.png" : "/icons/muteButton2.png"} alt="" className="h-5 w-5 brightness-0" />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              const nextL: AdjustedByHz = {};
                              for (const p of measuredPointsLeft) nextL[p.freqHz] = { ...p };
                              setAdjustedLeft(nextL);
                            }}
                            className="rounded-lg border border-surface-300 px-3 py-2 text-sm hover:bg-surface-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steps-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-100"
                          >
                            {t["hearingLossExperience.correct.resetLeft"]}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setStage("audiogram")}
                        className="rounded-lg border border-surface-300 px-3 py-2 text-sm hover:bg-surface-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steps-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-100"
                      >
                        {t["hearingLossExperience.back"]}
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setCompletedLevels((prev) => (prev.includes(activeLevel) ? prev : [...prev, activeLevel]));
                            goToMenu();
                          }}
                          className="rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm font-medium hover:bg-surface-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steps-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-100"
                        >
                          {t["hearingLossExperience.finishLevel"]}
                        </button>
                      </div>
                    </div>

                    <details className="rounded-xl border border-surface-300 bg-surface-50 p-4">
                      <summary className="cursor-pointer text-sm font-medium text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steps-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-100">
                        {t["hearingLossExperience.guide.title"]}
                      </summary>
                      <div className="mt-3 text-sm text-gray-500">{t["hearingLossExperience.guide.adjustRange"]}</div>
                      <div className="mt-2 text-sm text-gray-500">{t["hearingLossExperience.guide.adjustTips"]}</div>
                    </details>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
