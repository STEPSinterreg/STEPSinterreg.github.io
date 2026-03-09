import React, { useEffect, useMemo, useRef, useState } from "react";

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, "0");
  return `${m}:${ss}`;
}

export type AudioClipPlayerProps = {
  title: string;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  src: string;
  loop?: boolean;
  ariaLabel: string;

  playLabel: string;
  pauseLabel: string;
  stopLabel: string;

  onSeekStart?: () => void;

  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onEnded?: () => void;
};

export function AudioClipPlayer(props: AudioClipPlayerProps) {
  const {
    title,
    audioRef,
    src,
    loop,
    ariaLabel,
    playLabel,
    pauseLabel,
    stopLabel,
    onSeekStart,
    onPlay,
    onPause,
    onStop,
    onEnded,
  } = props;

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seeking, setSeeking] = useState(false);
  const [seekPct0to1000, setSeekPct0to1000] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const sliderElRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const readDuration = () => {
      const d = el.duration;
      setDuration(Number.isFinite(d) ? d : 0);
    };

    setCurrentTime(el.currentTime || 0);
    readDuration();

    const onTimeUpdate = () => setCurrentTime(el.currentTime || 0);
    const onLoaded = () => readDuration();
    const onDurationChange = () => readDuration();
    const onPlayInternal = () => setIsPlaying(true);
    const onPauseInternal = () => setIsPlaying(false);
    const onEndedInternal = () => {
      setCurrentTime(0);
      setIsPlaying(false);
      onEnded?.();
    };

    el.addEventListener("timeupdate", onTimeUpdate);
    el.addEventListener("loadedmetadata", onLoaded);
    el.addEventListener("durationchange", onDurationChange);
    el.addEventListener("play", onPlayInternal);
    el.addEventListener("pause", onPauseInternal);
    el.addEventListener("ended", onEndedInternal);

    return () => {
      el.removeEventListener("timeupdate", onTimeUpdate);
      el.removeEventListener("loadedmetadata", onLoaded);
      el.removeEventListener("durationchange", onDurationChange);
      el.removeEventListener("play", onPlayInternal);
      el.removeEventListener("pause", onPauseInternal);
      el.removeEventListener("ended", onEndedInternal);
    };
  }, [audioRef, src, onEnded]);

  const displayedTime = useMemo(() => {
    if (!seeking || seekPct0to1000 === null || duration <= 0) return currentTime;
    return duration * clamp01(seekPct0to1000 / 1000);
  }, [currentTime, duration, seeking, seekPct0to1000]);

  const timeText = useMemo(() => {
    const dur = duration > 0 ? formatTime(duration) : "--:--";
    return `${formatTime(displayedTime)} / ${dur}`;
  }, [displayedTime, duration]);

  const progressPct0to1000 = useMemo(() => {
    if (duration <= 0) return 0;
    const pct = (currentTime / duration) * 1000;
    return clamp(pct, 0, 1000);
  }, [currentTime, duration]);

  const sliderValue = seeking && seekPct0to1000 !== null ? seekPct0to1000 : progressPct0to1000;

  const togglePlayPause = () => {
    if (isPlaying) onPause();
    else onPlay();
  };

  const beginSeek = (e: React.PointerEvent<HTMLInputElement>) => {
    if (duration <= 0) return;
    try {
      (e.currentTarget as any).setPointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }
    setSeeking(true);
    setSeekPct0to1000(progressPct0to1000);

    // Spec: while dragging, all audio stops.
    onSeekStart?.();
    onPause();
  };

  const endSeek = (e: React.PointerEvent<HTMLInputElement>) => {
    if (!seeking) return;
    try {
      (e.currentTarget as any).releasePointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }

    const el = audioRef.current;
    const sliderPct = Number(e.currentTarget.value);
    const pct = Number.isFinite(sliderPct) ? sliderPct : (seekPct0to1000 ?? progressPct0to1000);
    const nextTime = duration > 0 ? duration * clamp01(pct / 1000) : 0;
    if (el && Number.isFinite(nextTime)) {
      try {
        el.currentTime = clamp(nextTime, 0, Math.max(0, (el.duration || duration) - 0.001));
      } catch {
        // ignore
      }
    }

    setCurrentTime(nextTime);
    setSeeking(false);
    setSeekPct0to1000(null);

    // Spec: when dropped, this audio starts playing from the dropped point.
    onPlay();
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-slate-200">{title}</div>
        </div>
        <div className="shrink-0 text-xs tabular-nums text-slate-500">{timeText}</div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="w-full">
          <input
            ref={sliderElRef}
            type="range"
            min={0}
            max={1000}
            step={1}
            value={Math.round(sliderValue)}
            disabled={duration <= 0}
            onPointerDown={beginSeek}
            onPointerUp={endSeek}
            onChange={(e) => setSeekPct0to1000(Number(e.target.value))}
            className={"w-full " + (duration <= 0 ? "opacity-50" : "")}
            aria-label={ariaLabel}
          />
        </div>

        <button
          type="button"
          onClick={togglePlayPause}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        >
          {isPlaying ? pauseLabel : playLabel}
        </button>
        <button
          type="button"
          onClick={onStop}
          className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        >
          {stopLabel}
        </button>
      </div>

      <audio
        ref={audioRef as unknown as React.Ref<HTMLAudioElement>}
        src={src}
        loop={!!loop}
        preload="metadata"
        aria-label={ariaLabel}
        className="hidden"
      />
    </div>
  );
}
