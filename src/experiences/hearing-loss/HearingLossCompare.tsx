import { useEffect, useRef, useState } from "react";
import UnifiedAudioPlayer, { type SoundOption } from "../../components/UnifiedAudioPlayer";
import AudioSpectrum from "../../components/AudioSpectrum";
import { engine } from "../../audio/engine";
import { hashStringToSeed, hearingLossProfileById, sampleHearingLossProfile } from "../../audio/hearingLossProfiles";
import type { HearingProfile } from "../../audio/profiles";
import { useLocale } from "../../i18n/LocaleContext";
import { translations } from "../../i18n/translations";

// ── Audio file catalogue ─────────────────────────────────────────────────────

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

const AUDIO_KINDS: readonly AudioKind[] = ["speechJessica", "speechMark", "street", "birds"];

const toPublicAudioSrc = (fileName: string) => `/hearing-loss/audios/${encodeURIComponent(fileName)}`;
const pickRandom = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]!;

// ── Compare profiles ─────────────────────────────────────────────────────────

type CurveType = "flat" | "lowFreqLoss" | "hfSloping" | "mute";

const COMPARE_PROFILES = [
  {
    profileId: "normal",
    titleKey: "hearingLossExperience.compare.profile.normal",
    descKey: "hearingLossExperience.compare.profile.normal.desc",
    curveType: "flat" as CurveType,
  },
  {
    profileId: "low_frequency_loss",
    titleKey: "hearingLossExperience.level.low_frequency_loss.title",
    descKey: "hearingLossExperience.compare.profile.low_frequency_loss.desc",
    curveType: "lowFreqLoss" as CurveType,
  },
  {
    profileId: "hf_sloping_age",
    titleKey: "hearingLossExperience.level.hf_sloping_age.title",
    descKey: "hearingLossExperience.compare.profile.hf_sloping_age.desc",
    curveType: "hfSloping" as CurveType,
  },
  {
    profileId: "mute",
    titleKey: "hearingLossExperience.level.deafness.title",
    descKey: "hearingLossExperience.compare.profile.mute.desc",
    curveType: "mute" as CurveType,
  },
] as const;

// ── Severe-loss scaling ──────────────────────────────────────────────────────

const SEVERE_LOSS_GAIN_SCALE = 1.8;

function toSevereProfile(profile: HearingProfile): HearingProfile {
  if (!profile?.params) return profile;
  const params: any = profile.params as any;
  const earFilters = params.earFilters;
  if (!earFilters || (!earFilters.left && !earFilters.right)) return profile;

  const scaleGain = (gain: unknown) => {
    if (typeof gain !== "number" || !Number.isFinite(gain)) return gain;
    return Math.max(-60, Math.min(60, gain * SEVERE_LOSS_GAIN_SCALE));
  };
  const scaleFilter = (f: any) => {
    if (!f || typeof f !== "object" || typeof f.gain !== "number") return f;
    return { ...f, gain: scaleGain(f.gain) };
  };

  return {
    ...profile,
    params: {
      ...params,
      earFilters: {
        left: Array.isArray(earFilters.left) ? earFilters.left.map(scaleFilter) : earFilters.left,
        right: Array.isArray(earFilters.right) ? earFilters.right.map(scaleFilter) : earFilters.right,
      },
    },
  };
}

// ── Frequency curve SVG ──────────────────────────────────────────────────────

// Each curve shows a stylised frequency response: left = low freq, right = high freq,
// top = more sound gets through, bottom = more attenuation.
const CURVE_PATHS: Record<CurveType, string> = {
  flat:        "M 0,10 L 100,10",
  lowFreqLoss: "M 0,34 C 22,34 38,10 58,10 L 100,10",
  hfSloping:   "M 0,10 L 42,10 C 58,10 72,34 100,34",
  mute:        "M 0,38 L 100,38",
};

function FrequencyCurve({ type, active }: { type: CurveType; active: boolean }) {
  const stroke = active ? "#7c3aed" : "#9ca3af";
  const areafill = active ? "rgba(124,58,237,0.10)" : "rgba(156,163,175,0.07)";
  const d = CURVE_PATHS[type];

  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-full w-full" aria-hidden="true">
      <path d={`${d} L 100,40 L 0,40 Z`} fill={areafill} />
      <path d={d} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── HearingLossCompare ──────────────────────────────────────────────────────

export function HearingLossCompare() {
  const { locale } = useLocale();
  const t = translations[locale];

  const [audioSrcByKind] = useState<Record<AudioKind, string>>(() => ({
    speechJessica: toPublicAudioSrc(pickRandom(AUDIO_FILES.speechJessica)),
    speechMark:    toPublicAudioSrc(pickRandom(AUDIO_FILES.speechMark)),
    street:        toPublicAudioSrc(pickRandom(AUDIO_FILES.street)),
    birds:         toPublicAudioSrc(pickRandom(AUDIO_FILES.birds)),
  }));

  const sampledProfiles = useRef<Record<string, HearingProfile | null>>({});
  useEffect(() => {
    for (const { profileId } of COMPARE_PROFILES) {
      const def = hearingLossProfileById[profileId];
      if (!def) { sampledProfiles.current[profileId] = null; continue; }
      const seed = hashStringToSeed(`compare_${profileId}`);
      const base = sampleHearingLossProfile(def, { seed });
      const shouldScale = profileId !== "normal" && profileId !== "mute";
      sampledProfiles.current[profileId] = shouldScale ? toSevereProfile(base) : base;
    }
  }, []);

  useEffect(() => () => { engine.stop(); }, []);

  const [selectedProfile, setSelectedProfile] = useState<string>(COMPARE_PROFILES[0].profileId);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const lastAudioElRef = useRef<HTMLAudioElement | null>(null);

  const applyEngineProfile = async (el: HTMLAudioElement, profileId: string) => {
    lastAudioElRef.current = el;
    await engine.attachMediaElement(el);
    const profile = sampledProfiles.current[profileId];
    if (profile) {
      await engine.setProfile(profile, 100);
    }
    const a = engine.getAnalyser();
    if (a) setAnalyser(a);
  };

  const onBeforePlay = async (el: HTMLAudioElement) => {
    await applyEngineProfile(el, selectedProfile);
  };

  const onProfileCardClick = (nextProfileId: string) => {
    setSelectedProfile(nextProfileId);
    const el = lastAudioElRef.current;
    if (el && !el.paused) {
      void applyEngineProfile(el, nextProfileId);
    }
  };

  const sounds: SoundOption[] = AUDIO_KINDS.map((kind) => ({
    key: kind,
    label: t[`hearingLossExperience.audioKind.${kind}`],
    loop: AUDIO_LOOP[kind],
  }));

  const srcByKey: Record<string, string> = AUDIO_KINDS.reduce(
    (acc, kind) => ({ ...acc, [kind]: audioSrcByKind[kind] }),
    {}
  );

  return (
    <div className="space-y-5">
      {/* Hero */}
      <section className="overflow-hidden rounded-2xl border border-surface-300 bg-white shadow-sm">
        <div className="border-b border-surface-300 bg-steps-50 px-6 py-3 dark:bg-steps-100">
          <div className="text-xs font-semibold uppercase tracking-widest text-steps-600">
            {t["hearingLossExperience.compare.tagline"]}
          </div>
        </div>
        <div className="p-6 sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-800 sm:text-3xl">
            {t["hearingLossExperience.compare.title"]}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-gray-500 sm:text-base">
            {t["hearingLossExperience.compare.body"]}
          </p>
        </div>
      </section>

      {/* Step 1 — Profile cards */}
      <section className="rounded-2xl border border-surface-300 bg-white p-5 shadow-sm">
        <div className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-500">
          {t["hearingLossExperience.compare.step1Label"]}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {COMPARE_PROFILES.map(({ profileId, titleKey, descKey, curveType }) => {
            const active = selectedProfile === profileId;
            return (
              <button
                key={profileId}
                type="button"
                onClick={() => onProfileCardClick(profileId)}
                aria-pressed={active}
                className={[
                  "relative flex flex-col gap-3 rounded-xl border-2 p-4 text-left transition",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steps-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
                  active
                    ? "border-steps-400 bg-steps-50/70 shadow-sm"
                    : "border-surface-300 bg-white hover:border-steps-200 hover:bg-surface-50",
                ].join(" ")}
              >
                {/* Frequency response curve */}
                <div className="h-12 w-full overflow-hidden rounded-lg bg-surface-100">
                  <FrequencyCurve type={curveType} active={active} />
                </div>

                {/* Name + active checkmark */}
                <div className="flex items-start justify-between gap-2">
                  <span className={`text-sm font-semibold leading-snug ${active ? "text-steps-700" : "text-gray-800"}`}>
                    {t[titleKey]}
                  </span>
                  {active && (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="mt-0.5 shrink-0 text-steps-500"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="m9 12 2 2 4-4" />
                    </svg>
                  )}
                </div>

                {/* Short description */}
                <p className="text-xs leading-relaxed text-gray-500">{t[descKey]}</p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Step 2 — Audio player */}
      <section>
        <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-gray-500">
          {t["hearingLossExperience.compare.step2Label"]}
        </div>
        <UnifiedAudioPlayer
          sounds={sounds}
          audioSrcByKey={srcByKey}
          onBeforePlay={onBeforePlay}
          playLabel={t["play"]}
          pauseLabel={t["pause"]}
          stopLabel={t["stop"]}
          soundLabel={t["hearingLossExperience.unifiedPlayer.soundLabel"]}
          ariaLabel={t["hearingLossExperience.audioPlayerLabel"]}
        />
      </section>

      {/* Live spectrum visualiser */}
      <section className="rounded-2xl border border-surface-300 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          {t["hearingLossExperience.unifiedPlayer.waveLabel"]}
        </div>
        {analyser ? (
          <AudioSpectrum analyser={analyser} height={140} />
        ) : (
          <div className="flex h-[140px] items-center justify-center rounded-lg border border-dashed border-surface-300 bg-surface-50 text-sm text-gray-400">
            {t["hearingLossExperience.unifiedPlayer.wavePlaceholder"]}
          </div>
        )}
      </section>

      {/* Hint footer */}
      <div className="rounded-xl border border-steps-200 bg-steps-50 px-4 py-3 text-sm text-gray-700">
        {t["hearingLossExperience.compare.hint"]}
      </div>
    </div>
  );
}
