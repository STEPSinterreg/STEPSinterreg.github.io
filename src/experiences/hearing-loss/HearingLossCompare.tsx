import { useEffect, useImperativeHandle, useRef, useState } from "react";
import { AudioClipPlayer } from "../../components/AudioClipPlayer";
import { engine } from "../../audio/engine";
import { hashStringToSeed, hearingLossProfileById, sampleHearingLossProfile } from "../../audio/hearingLossProfiles";
import type { HearingProfile } from "../../audio/profiles";
import { useLocale } from "../../i18n/LocaleContext";
import { translations } from "../../i18n/translations";

// ── Audio file catalogue (same as main HearingLoss experience) ────────────────

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

// ── Profiles shown in the compare grid ───────────────────────────────────────

const COMPARE_PROFILES = [
  { profileId: "normal",            titleKey: "hearingLossExperience.compare.profile.normal" },
  { profileId: "low_frequency_loss", titleKey: "hearingLossExperience.level.low_frequency_loss.title" },
  { profileId: "hf_sloping_age",    titleKey: "hearingLossExperience.level.hf_sloping_age.title" },
  { profileId: "mute",              titleKey: "hearingLossExperience.level.deafness.title" },
] as const;

// ── Severe-loss scaling (same logic as main HearingLoss experience) ───────────

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

// ── CompareCard ───────────────────────────────────────────────────────────────

type CompareCardHandle = {
  pauseAll: () => void;
};

type CompareCardProps = {
  ref?: React.RefObject<CompareCardHandle | null>;
  profileId: string;
  title: string;
  audioSrcByKind: Record<AudioKind, string>;
  audioLabelByKind: Record<AudioKind, string>;
  playLabel: string;
  pauseLabel: string;
  stopLabel: string;
  audioPlayerLabel: string;
  onBeforePlay: (kind: AudioKind, el: HTMLAudioElement) => Promise<void>;
};

function CompareCard({
  ref,
  profileId: _profileId,
  title,
  audioSrcByKind,
  audioLabelByKind,
  playLabel,
  pauseLabel,
  stopLabel,
  audioPlayerLabel,
  onBeforePlay,
}: CompareCardProps) {
  const speechJessicaRef = useRef<HTMLAudioElement | null>(null);
  const speechMarkRef    = useRef<HTMLAudioElement | null>(null);
  const streetRef        = useRef<HTMLAudioElement | null>(null);
  const birdsRef         = useRef<HTMLAudioElement | null>(null);

  const [playingKind, setPlayingKind] = useState<AudioKind | null>(null);

  const getAudioRef = (kind: AudioKind): React.RefObject<HTMLAudioElement | null> => {
    switch (kind) {
      case "speechJessica": return speechJessicaRef;
      case "speechMark":    return speechMarkRef;
      case "street":        return streetRef;
      case "birds":         return birdsRef;
    }
  };

  const pauseAllLocal = () => {
    for (const kind of AUDIO_KINDS) {
      getAudioRef(kind).current?.pause();
    }
    setPlayingKind(null);
  };

  useImperativeHandle(ref, () => ({ pauseAll: pauseAllLocal }));

  const playAudio = async (kind: AudioKind) => {
    try {
      const el = getAudioRef(kind).current;
      if (!el) return;

      // Pause sibling audio kinds within this card.
      for (const k of AUDIO_KINDS) {
        if (k !== kind) getAudioRef(k).current?.pause();
      }

      setPlayingKind(kind);
      // Let the parent pause other cards and set the engine profile.
      await onBeforePlay(kind, el);
      await el.play();
    } catch {
      setPlayingKind(null);
    }
  };

  const pauseAudio = (kind: AudioKind) => {
    getAudioRef(kind).current?.pause();
    setPlayingKind((prev) => (prev === kind ? null : prev));
  };

  const stopAudio = (kind: AudioKind) => {
    const el = getAudioRef(kind).current;
    if (!el) return;
    el.pause();
    el.currentTime = 0;
    setPlayingKind((prev) => (prev === kind ? null : prev));
  };

  const onNativeAudioPause = (kind: AudioKind) =>
    setPlayingKind((prev) => (prev === kind ? null : prev));

  // Suppress unused-variable warning: playingKind is kept to force re-render
  void playingKind;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-3 sm:p-4">
      <h2 className="mb-2 text-sm font-semibold text-slate-100">{title}</h2>
      <div className="space-y-1.5">
        {AUDIO_KINDS.map((kind) => (
          <AudioClipPlayer
            key={kind}
            title={audioLabelByKind[kind]}
            audioRef={getAudioRef(kind)}
            ariaLabel={audioPlayerLabel}
            src={audioSrcByKind[kind]}
            loop={AUDIO_LOOP[kind]}
            compact
            playLabel={playLabel}
            pauseLabel={pauseLabel}
            stopLabel={stopLabel}
            onSeekStart={pauseAllLocal}
            onPlay={() => void playAudio(kind)}
            onPause={() => pauseAudio(kind)}
            onStop={() => stopAudio(kind)}
            onEnded={() => onNativeAudioPause(kind)}
          />
        ))}
      </div>
    </div>
  );
}

// ── HearingLossCompare ────────────────────────────────────────────────────────

export function HearingLossCompare() {
  const { locale } = useLocale();
  const t = translations[locale];

  // Pick one random file per audio kind upfront; same file across all cards for
  // a fair side-by-side comparison.
  const [audioSrcByKind] = useState<Record<AudioKind, string>>(() => ({
    speechJessica: toPublicAudioSrc(pickRandom(AUDIO_FILES.speechJessica)),
    speechMark:    toPublicAudioSrc(pickRandom(AUDIO_FILES.speechMark)),
    street:        toPublicAudioSrc(pickRandom(AUDIO_FILES.street)),
    birds:         toPublicAudioSrc(pickRandom(AUDIO_FILES.birds)),
  }));

  // One ref per card, keyed by profileId.
  const cardRefs = useRef<Record<string, React.RefObject<CompareCardHandle | null>>>(
    Object.fromEntries(COMPARE_PROFILES.map((p) => [p.profileId, { current: null }]))
  );

  // Pre-sample profiles at stable seeds so they don't change between renders.
  const sampledProfiles = useRef<Record<string, HearingProfile | null>>({});
  useEffect(() => {
    for (const { profileId } of COMPARE_PROFILES) {
      const def = hearingLossProfileById[profileId];
      if (!def) { sampledProfiles.current[profileId] = null; continue; }
      const seed = hashStringToSeed(`compare_${profileId}`);
      const base = sampleHearingLossProfile(def, { seed });
      // Apply severe scaling so the difference is clearly audible, but skip
      // "normal" (no filters) and "mute" (already fully silent).
      const shouldScale = profileId !== "normal" && profileId !== "mute";
      sampledProfiles.current[profileId] = shouldScale ? toSevereProfile(base) : base;
    }
  }, []);

  // Stop all engine audio when this view unmounts (user navigates away).
  useEffect(() => () => { engine.stop(); }, []);

  const handleBeforePlay = async (profileId: string, _kind: AudioKind, el: HTMLAudioElement) => {
    // Pause all other cards first.
    for (const { profileId: pid } of COMPARE_PROFILES) {
      if (pid !== profileId) {
        cardRefs.current[pid]?.current?.pauseAll();
      }
    }
    // Route this element through the engine with the card's profile.
    await engine.attachMediaElement(el);
    const profile = sampledProfiles.current[profileId];
    if (profile) {
      await engine.setProfile(profile, 100);
    }
  };

  const audioLabelByKind: Record<AudioKind, string> = {
    speechJessica: t["hearingLossExperience.audioKind.speechJessica"],
    speechMark:    t["hearingLossExperience.audioKind.speechMark"],
    street:        t["hearingLossExperience.audioKind.street"],
    birds:         t["hearingLossExperience.audioKind.birds"],
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-800 bg-slate-900/30 p-5 sm:p-6">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {t["hearingLossExperience.compare.title"]}
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">{t["hearingLossExperience.compare.body"]}</p>
      </section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {COMPARE_PROFILES.map(({ profileId, titleKey }) => (
          <CompareCard
            key={profileId}
            ref={cardRefs.current[profileId]}
            profileId={profileId}
            title={t[titleKey]}
            audioSrcByKind={audioSrcByKind}
            audioLabelByKind={audioLabelByKind}
            playLabel={t["play"]}
            pauseLabel={t["pause"]}
            stopLabel={t["stop"]}
            audioPlayerLabel={t["hearingLossExperience.audioPlayerLabel"]}
            onBeforePlay={(kind, el) => handleBeforePlay(profileId, kind, el)}
          />
        ))}
      </div>
    </div>
  );
}
