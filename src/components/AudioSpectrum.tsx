import { useEffect, useRef } from 'react';

type VisualizerMode = 'spectrum' | 'spectrogram' | 'waveform';

type Props = {
  analyser: AnalyserNode | null;
  width?: number;
  height?: number;
  /**
   * - spectrum: current log-scaled frequency line
   * - spectrogram: legacy frequency bars (not a true time-varying spectrogram)
   * - waveform: time-domain waveform line
   */
  mode?: VisualizerMode;
};

export default function AudioSpectrum({ analyser, width = 800, height = 120, mode = 'spectrum' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    try {
      if (analyser.fftSize < 2048) analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = mode === 'waveform' ? 0.6 : 0.85;
    } catch {
      // ignore
    }

    const freqLen = analyser.frequencyBinCount;
    const freqData = new Uint8Array(freqLen);
    const timeData = new Uint8Array(analyser.fftSize);

    const fillBackground = (w: number, h: number) => {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, w, h);
    };

    const drawBaseline = (w: number, h: number) => {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h - 0.5);
      ctx.lineTo(w, h - 0.5);
      ctx.stroke();
    };

    const drawSpectrumLineLog = (w: number, h: number) => {
      analyser.getByteFrequencyData(freqData);

      ctx.strokeStyle = 'rgba(96, 165, 250, 0.95)';
      ctx.lineWidth = 2;
      ctx.beginPath();

      const sr = (analyser as any).context?.sampleRate;
      const nyquist = typeof sr === 'number' && Number.isFinite(sr) ? sr / 2 : 24000;
      const minHz = 20;
      const maxHz = Math.max(minHz + 1, nyquist);

      const pointCount = Math.max(64, Math.min(512, Math.floor(w)));

      const binForHz = (hz: number) => {
        const clamped = Math.max(0, Math.min(maxHz, hz));
        const idx = Math.round((clamped / maxHz) * (freqLen - 1));
        return Math.max(0, Math.min(freqLen - 1, idx));
      };

      for (let p = 0; p < pointCount; p++) {
        const x = (p / Math.max(1, pointCount - 1)) * w;
        const t = p / Math.max(1, pointCount - 1);
        const hz = minHz * Math.pow(maxHz / minHz, t);
        const i = binForHz(hz);
        const v = freqData[i] / 255;
        const y = h - v * h;
        if (p === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    const drawFrequencyBars = (w: number, h: number) => {
      analyser.getByteFrequencyData(freqData);

      const barCount = Math.max(48, Math.min(256, Math.floor(w / 3)));
      const barW = w / barCount;

      ctx.fillStyle = 'rgba(96, 165, 250, 0.95)';
      for (let b = 0; b < barCount; b++) {
        const t = b / Math.max(1, barCount - 1);
        const i = Math.max(0, Math.min(freqLen - 1, Math.floor(t * (freqLen - 1))));
        const v = freqData[i] / 255;
        const barH = v * h;
        const x = b * barW;
        const y = h - barH;
        ctx.fillRect(x, y, Math.max(1, barW - 1), barH);
      }
    };

    const drawWaveform = (w: number, h: number) => {
      analyser.getByteTimeDomainData(timeData);

      ctx.strokeStyle = 'rgba(96, 165, 250, 0.95)';
      ctx.lineWidth = 2;
      ctx.beginPath();

      for (let i = 0; i < timeData.length; i++) {
        const x = (i / Math.max(1, timeData.length - 1)) * w;
        const v = timeData[i] / 255;
        const y = h - v * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;

      fillBackground(w, h);
      drawBaseline(w, h);

      if (mode === 'waveform') drawWaveform(w, h);
      else if (mode === 'spectrogram') drawFrequencyBars(w, h);
      else drawSpectrumLineLog(w, h);

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [analyser, mode]);

  return <canvas ref={canvasRef} width={width} height={height} className="w-full rounded bg-slate-900" />;
}
