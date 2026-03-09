import React, { useEffect, useMemo, useState } from 'react';
import { useLocale } from '../i18n/LocaleContext';
import { translations } from '../i18n/translations';
import { hearingProfiles } from '../audio/profiles';
import { engine } from '../audio/engine';

// audio files discovered in public/hearing-loss/audios
const AUDIO_FILES = [
  'Jessica 1.mp3',
  'Jessica 2.mp3',
  'Mark 1.mp3',
  'Mark 2.mp3',
];

export default function AudioLab() {
  const { locale } = useLocale();
  const t = translations[locale];
  const [loaded, setLoaded] = useState(false);
  const [profileIndex, setProfileIndex] = useState(0);
  const [intensity, setIntensity] = useState(100);
  const [fileIndex, setFileIndex] = useState(0);

  const profiles = useMemo(() => hearingProfiles, []);
  const active = profiles[profileIndex];

  useEffect(() => {
    return () => {
      engine.destroy();
    };
  }, []);

  const getUrlForIndex = (idx: number) => `/hearing-loss/audios/${encodeURIComponent(AUDIO_FILES[idx])}`;

  const format = (template: string, vars: Record<string, string>) =>
    template.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k]! : `{${k}}`));

  const handleLoad = async () => {
    const url = getUrlForIndex(fileIndex);
    try {
      await engine.loadAudio(url);
      setLoaded(true);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to load audio", err);
      alert(format(t.audio_lab_load_error, { url }));
    }
  };

  const handlePlay = async () => {
    if (!loaded) {
      await handleLoad();
    }
    await engine.initOnUserGesture();
    await engine.setProfile(active, intensity);
    await engine.play();
  };

  const handleStop = () => {
    engine.stop();
  };

  const handlePause = () => {
    engine.pause();
  };

  const handleRandom = () => {
    const i = Math.floor(Math.random() * profiles.length);
    setProfileIndex(i);
    engine.setProfile(profiles[i], intensity);
  };

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const idx = Number(e.target.value);
    setProfileIndex(idx);
    engine.setProfile(profiles[idx], intensity);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const idx = Number(e.target.value);
    setFileIndex(idx);
    setLoaded(false);
  };

  const handleIntensity = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setIntensity(v);
    engine.setIntensity(v);
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold">{t.audio_lab_title}</h1>
      <p className="text-sm text-slate-400">{t.audio_lab_desc}</p>

      <div className="mt-4 flex flex-col gap-3 max-w-lg">
        <div className="flex gap-2">
          <button className="rounded bg-slate-700 px-3 py-2" onClick={handlePlay}>{t.play}</button>
          <button className="rounded bg-slate-700 px-3 py-2" onClick={handlePause}>{t.pause}</button>
          <button className="rounded bg-slate-700 px-3 py-2" onClick={handleStop}>{t.stop}</button>
          <button className="rounded bg-slate-700 px-3 py-2" onClick={handleLoad}>{t.load}</button>
        </div>

        <div className="flex gap-2 items-center">
          <label className="text-sm">{t.file_label}</label>
          <select value={fileIndex} onChange={handleFileSelect} className="rounded bg-slate-800 px-2 py-1">
            {AUDIO_FILES.map((f, i) => (
              <option key={f} value={i}>{f}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-2 items-center">
          <label className="text-sm">{t.profile_label}</label>
          <select value={profileIndex} onChange={handleSelect} className="rounded bg-slate-800 px-2 py-1">
            {profiles.map((p, i) => (
              <option key={p.id} value={i}>{p.name}</option>
            ))}
          </select>
          <button className="rounded bg-slate-700 px-3 py-2" onClick={handleRandom}>{t.random_profile}</button>
        </div>

        <div>
          <div className="text-sm font-medium">{t.active_profile}</div>
          <div className="text-sm text-slate-300">{active.name} — {active.description}</div>
        </div>

        <div>
          <label className="text-sm">{t.intensity_label}: {intensity}%</label>
          <input type="range" min={0} max={100} value={intensity} onChange={handleIntensity} className="w-full" />
        </div>

      </div>
    </div>
  );
}
