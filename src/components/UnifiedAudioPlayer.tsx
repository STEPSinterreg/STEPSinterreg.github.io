import React, { useEffect, useMemo, useRef, useState } from "react";

function clamp01(n: number) { return Math.max(0, Math.min(1, n)); }
function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }
function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, "0");
  return `${m}:${ss}`;
}

export type SoundOption = {
  key: string;
  label: string;
  loop?: boolean;
  source?: "audio" | "microphone";
};

export type ProfileOption = {
  key: string;
  label: string;
};

type Props = {
  sounds: SoundOption[];
  audioSrcByKey: Record<string, string>;

  profiles?: ProfileOption[];
  selectedProfile?: string;
  onProfileChange?: (profileKey: string) => void;

  /** Called before play() so parent can attach to engine + set profile. */
  onBeforePlay?: (audioEl: HTMLAudioElement, soundKey: string) => Promise<void> | void;
  onStartMicrophone?: (soundKey: string) => Promise<void> | void;
  onStopMicrophone?: (soundKey: string) => Promise<void> | void;

  playLabel: string;
  pauseLabel: string;
  stopLabel: string;
  soundLabel: string;
  profileLabel?: string;
  headerLabel?: string;
  ariaLabel?: string;
};

const PILL_BASE =
  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steps-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-100";
const PILL_ACTIVE = "border-steps-300 bg-steps-50 text-gray-800 font-medium hover:bg-steps-100";
const PILL_INACTIVE = "border-surface-300 bg-white text-gray-700 hover:bg-surface-200";

export default function UnifiedAudioPlayer({
  sounds,
  audioSrcByKey,
  profiles,
  selectedProfile,
  onProfileChange,
  onBeforePlay,
  onStartMicrophone,
  onStopMicrophone,
  playLabel,
  pauseLabel,
  stopLabel,
  soundLabel,
  profileLabel,
  headerLabel,
  ariaLabel,
}: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [selectedKey, setSelectedKey] = useState<string>(sounds[0]?.key ?? "");
  const [playedKeys, setPlayedKeys] = useState<Set<string>>(new Set());
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seeking, setSeeking] = useState(false);
  const [seekPct, setSeekPct] = useState<number | null>(null);

  const selectedSound = useMemo(
    () => sounds.find((s) => s.key === selectedKey) ?? sounds[0],
    [sounds, selectedKey]
  );

  const src = selectedSound ? audioSrcByKey[selectedSound.key] : "";
  const loop = !!selectedSound?.loop;
  const isMicrophone = selectedSound?.source === "microphone";

  // Reset playback when audio source actually changes.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    try { el.pause(); el.currentTime = 0; } catch { /* ignore */ }
  }, [src, isMicrophone]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const readDuration = () => {
      const d = el.duration;
      setDuration(Number.isFinite(d) ? d : 0);
    };
    const onTimeUpdate = () => setCurrentTime(el.currentTime || 0);
    const onPlayInternal = () => setIsPlaying(true);
    const onPauseInternal = () => setIsPlaying(false);
    const onEndedInternal = () => {
      setCurrentTime(0);
      setIsPlaying(false);
    };

    el.addEventListener("timeupdate", onTimeUpdate);
    el.addEventListener("loadedmetadata", readDuration);
    el.addEventListener("durationchange", readDuration);
    el.addEventListener("play", onPlayInternal);
    el.addEventListener("pause", onPauseInternal);
    el.addEventListener("ended", onEndedInternal);

    return () => {
      el.removeEventListener("timeupdate", onTimeUpdate);
      el.removeEventListener("loadedmetadata", readDuration);
      el.removeEventListener("durationchange", readDuration);
      el.removeEventListener("play", onPlayInternal);
      el.removeEventListener("pause", onPauseInternal);
      el.removeEventListener("ended", onEndedInternal);
    };
  }, []);

  const togglePlay = async () => {
    const el = audioRef.current;
    if (isMicrophone && selectedSound) {
      try {
        if (isPlaying) {
          await onStopMicrophone?.(selectedSound.key);
          setIsPlaying(false);
        } else {
          await onStartMicrophone?.(selectedSound.key);
          setIsPlaying(true);
          setPlayedKeys((prev) => {
            if (prev.has(selectedKey)) return prev;
            const next = new Set(prev);
            next.add(selectedKey);
            return next;
          });
        }
      } catch {
        setIsPlaying(false);
      }
      return;
    }
    if (!el) return;
    if (isPlaying) {
      el.pause();
    } else {
      try {
        if (onBeforePlay && selectedSound) {
          await onBeforePlay(el, selectedSound.key);
        }
        await el.play();
        setPlayedKeys((prev) => {
          if (prev.has(selectedKey)) return prev;
          const next = new Set(prev);
          next.add(selectedKey);
          return next;
        });
      } catch {
        // ignore
      }
    }
  };

  const handleStop = () => {
    const el = audioRef.current;
    if (isMicrophone && selectedSound) {
      void onStopMicrophone?.(selectedSound.key);
      setIsPlaying(false);
      setCurrentTime(0);
      return;
    }
    if (!el) return;
    try { el.pause(); el.currentTime = 0; } catch { /* ignore */ }
    setCurrentTime(0);
  };

  const selectSound = (key: string) => {
    if (key === selectedKey) return;
    const el = audioRef.current;
    const wasPlaying = isPlaying;
    const wasMicrophone = selectedSound?.source === "microphone";
    if (el) {
      try { el.pause(); el.currentTime = 0; } catch { /* ignore */ }
    }
    if (wasMicrophone && selectedSound) {
      void onStopMicrophone?.(selectedSound.key);
      setIsPlaying(false);
    }
    setSelectedKey(key);
    if (wasPlaying) {
      requestAnimationFrame(async () => {
        const nextSound = sounds.find((s) => s.key === key);
        if (nextSound?.source === "microphone") {
          try {
            await onStartMicrophone?.(key);
            setIsPlaying(true);
            setPlayedKeys((prev) => {
              if (prev.has(key)) return prev;
              const n = new Set(prev);
              n.add(key);
              return n;
            });
          } catch {
            setIsPlaying(false);
          }
          return;
        }

        const next = audioRef.current;
        if (!next) return;
        try {
          if (onBeforePlay) {
            await onBeforePlay(next, key);
          }
          await next.play();
          setPlayedKeys((prev) => {
            if (prev.has(key)) return prev;
            const n = new Set(prev);
            n.add(key);
            return n;
          });
        } catch {
          // ignore
        }
      });
    }
  };

  const togglePlayAfterSeek = async () => {
    const el = audioRef.current;
    if (!el) return;
    try {
      if (onBeforePlay && selectedSound) {
        await onBeforePlay(el, selectedSound.key);
      }
      await el.play();
    } catch {
      // ignore
    }
  };

  const displayedTime = useMemo(() => {
    if (isMicrophone || !seeking || seekPct === null || duration <= 0) return currentTime;
    return duration * clamp01(seekPct / 1000);
  }, [currentTime, duration, isMicrophone, seeking, seekPct]);

  const progress0to1000 = useMemo(() => {
    if (isMicrophone || duration <= 0) return 0;
    return clamp((currentTime / duration) * 1000, 0, 1000);
  }, [currentTime, duration, isMicrophone]);

  const sliderValue = seeking && seekPct !== null ? seekPct : progress0to1000;

  const beginSeek = (e: React.PointerEvent<HTMLInputElement>) => {
    if (duration <= 0) return;
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
    setSeeking(true);
    setSeekPct(progress0to1000);
    const el = audioRef.current;
    if (el && !el.paused) el.pause();
  };

  const endSeek = (e: React.PointerEvent<HTMLInputElement>) => {
    if (!seeking) return;
    try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch { /* ignore */ }
    const el = audioRef.current;
    const pct = Number(e.currentTarget.value);
    const nextTime = duration > 0 ? duration * clamp01(pct / 1000) : 0;
    if (el && Number.isFinite(nextTime)) {
      try {
        el.currentTime = clamp(nextTime, 0, Math.max(0, (el.duration || duration) - 0.001));
      } catch { /* ignore */ }
    }
    setCurrentTime(nextTime);
    setSeeking(false);
    setSeekPct(null);
    void togglePlayAfterSeek();
  };

  const timeText = isMicrophone && isPlaying
    ? "Live"
    : `${formatTime(displayedTime)} / ${duration > 0 ? formatTime(duration) : "--:--"}`;

  return (
    <div className="rounded-2xl border border-surface-300 bg-white p-4 shadow-sm sm:p-5">
      {headerLabel && (
        <div className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-500">
          {headerLabel}
        </div>
      )}
      {/* Header: current sound + time */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-gray-800">
            {selectedSound?.label}
          </div>
        </div>
        <div className="shrink-0 text-xs tabular-nums text-gray-500">{timeText}</div>
      </div>

      {/* Scrub bar */}
      <div className="mt-3">
        <input
          type="range"
          min={0}
          max={1000}
          step={1}
          value={Math.round(sliderValue)}
          disabled={isMicrophone || duration <= 0}
          onPointerDown={beginSeek}
          onPointerUp={endSeek}
          onChange={(e) => setSeekPct(Number(e.target.value))}
          className={"w-full " + (duration <= 0 ? "opacity-50" : "")}
          aria-label={ariaLabel}
        />
      </div>

      {/* Transport controls */}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={togglePlay}
          aria-pressed={isPlaying}
          className="inline-flex items-center gap-2 rounded-xl border border-steps-300 bg-steps-50 px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-steps-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steps-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-100"
        >
          {isPlaying ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
          <span>{isPlaying ? pauseLabel : playLabel}</span>
        </button>
        <button
          type="button"
          onClick={handleStop}
          className="rounded-lg border border-surface-300 px-3 py-2 text-sm text-gray-700 hover:bg-surface-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steps-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-100"
          aria-label={stopLabel}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <rect x="6" y="6" width="12" height="12" rx="1" />
          </svg>
        </button>
      </div>

      {/* Sound picker pills */}
      <div className="mt-5">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{soundLabel}</div>
        <div className="flex flex-wrap gap-2">
          {sounds.map((s) => {
            const active = s.key === selectedKey;
            const played = playedKeys.has(s.key);
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => selectSound(s.key)}
                aria-pressed={active}
                className={`${PILL_BASE} ${active ? PILL_ACTIVE : PILL_INACTIVE}`}
              >
                <span>{s.label}</span>
                {played && !active && (
                  <span className="h-1.5 w-1.5 rounded-full bg-steps-400" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Profile picker pills (Compare only) */}
      {profiles && profiles.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{profileLabel}</div>
          <div className="flex flex-wrap gap-2">
            {profiles.map((p) => {
              const active = p.key === selectedProfile;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => onProfileChange?.(p.key)}
                  aria-pressed={active}
                  className={`${PILL_BASE} ${active ? PILL_ACTIVE : PILL_INACTIVE}`}
                >
                  <span>{p.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <audio
        ref={audioRef}
        src={src}
        loop={loop}
        preload="metadata"
        aria-label={ariaLabel}
        className="hidden"
      />
    </div>
  );
}
