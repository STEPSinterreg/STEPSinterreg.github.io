import { useEffect, useRef } from 'react';
import { useLocale } from '../i18n/LocaleContext';
import { useTheme } from '../i18n/ThemeContext';
import { translations } from '../i18n/translations';

type VisualizerMode = 'spectrum' | 'spectrogram' | 'waveform';

type Props = {
  analyser: AnalyserNode | null;
  width?: number;
  height?: number;
  mode?: VisualizerMode;
};

const LIGHT = {
  bg: '#f7f5f2',
  grid: 'rgba(90, 35, 130, 0.06)',
  baseline: 'rgba(90, 35, 130, 0.15)',
  label: '#6b7280',
  line: '#5A2382',
  gradTop: 'rgba(90, 35, 130, 0.25)',
  gradBot: 'rgba(90, 35, 130, 0.03)',
  barBase: [90, 35, 130] as const,
};

const DARK = {
  bg: '#0f172a',
  grid: 'rgba(168, 85, 247, 0.08)',
  baseline: 'rgba(168, 85, 247, 0.2)',
  label: '#cbd5e1',
  line: '#A855F7',
  gradTop: 'rgba(168, 85, 247, 0.3)',
  gradBot: 'rgba(168, 85, 247, 0.02)',
  barBase: [168, 85, 247] as const,
};

export default function AudioSpectrum({ analyser, width = 800, height = 120, mode = 'spectrum' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const { resolved: theme } = useTheme();
  const { locale } = useLocale();
  const t = translations[locale];

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

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      const c = theme === 'dark' ? DARK : LIGHT;
      const padLeft = mode === 'waveform' ? 8 : 44;
      const padRight = mode === 'waveform' ? 8 : 12;
      const padTop = 8;
      const padBottom = mode === 'waveform' ? 8 : 28;
      const plotX = padLeft;
      const plotY = padTop;
      const plotW = Math.max(1, w - padLeft - padRight);
      const plotH = Math.max(1, h - padTop - padBottom);
      const plotBottom = plotY + plotH;

      // Background
      ctx.fillStyle = c.bg;
      ctx.fillRect(0, 0, w, h);

      // Grid lines
      ctx.strokeStyle = c.grid;
      ctx.lineWidth = 1;
      for (let i = 1; i <= 4; i++) {
        const y = plotY + (plotH / 5) * i;
        ctx.beginPath();
        ctx.moveTo(plotX, y);
        ctx.lineTo(plotX + plotW, y);
        ctx.stroke();
      }

      // Baseline
      ctx.strokeStyle = c.baseline;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(plotX, plotBottom + 0.5);
      ctx.lineTo(plotX + plotW, plotBottom + 0.5);
      ctx.stroke();

      if (mode === 'waveform') {
        analyser.getByteTimeDomainData(timeData);
        ctx.strokeStyle = c.line;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < timeData.length; i++) {
          const x = plotX + (i / Math.max(1, timeData.length - 1)) * plotW;
          const v = timeData[i] / 255;
          const y = plotY + (1 - v) * plotH;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else if (mode === 'spectrogram') {
        analyser.getByteFrequencyData(freqData);
        const barCount = Math.max(48, Math.min(256, Math.floor(plotW / 3)));
        const barW = plotW / barCount;
        const [r, g, b] = c.barBase;
        for (let bIdx = 0; bIdx < barCount; bIdx++) {
          const t = bIdx / Math.max(1, barCount - 1);
          const i = Math.max(0, Math.min(freqLen - 1, Math.floor(t * (freqLen - 1))));
          const v = freqData[i] / 255;
          const barH = v * plotH;
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.3 + v * 0.65})`;
          ctx.fillRect(plotX + bIdx * barW, plotBottom - barH, Math.max(1, barW - 1), barH);
        }
      } else {
        analyser.getByteFrequencyData(freqData);
        const sr = (analyser as any).context?.sampleRate;
        const nyquist = typeof sr === 'number' && Number.isFinite(sr) ? sr / 2 : 24000;
        const minHz = 0;
        const maxHz = Math.min(8000, Math.max(1000, nyquist));
        const pointCount = Math.max(64, Math.min(512, Math.floor(plotW)));

        const binForHz = (hz: number) => {
          const clamped = Math.max(0, Math.min(maxHz, hz));
          const idx = Math.round((clamped / nyquist) * (freqLen - 1));
          return Math.max(0, Math.min(freqLen - 1, idx));
        };

        const ticks = [250, 500, 1000, 2000, 4000, 8000].filter((hz) => hz <= maxHz);
        ctx.fillStyle = c.label;
        ctx.font = '11px sans-serif';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'right';
        ctx.fillText('100%', padLeft - 8, plotY + 2);
        ctx.fillText('0%', padLeft - 8, plotBottom - 2);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ticks.forEach((hz) => {
          const x = plotX + ((hz - minHz) / (maxHz - minHz)) * plotW;
          ctx.strokeStyle = c.grid;
          ctx.beginPath();
          ctx.moveTo(x, plotY);
          ctx.lineTo(x, plotBottom);
          ctx.stroke();
          ctx.fillStyle = c.label;
          ctx.fillText(hz >= 1000 ? `${hz / 1000} kHz` : `${hz} Hz`, x, plotBottom + 6);
        });

        ctx.save();
        ctx.translate(12, plotY + plotH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = c.label;
        ctx.fillText(t['hearingLossExperience.spectrum.levelAxis'], 0, 0);
        ctx.restore();

        // Filled gradient area
        ctx.beginPath();
        ctx.moveTo(plotX, plotBottom);
        for (let p = 0; p < pointCount; p++) {
          const x = plotX + (p / Math.max(1, pointCount - 1)) * plotW;
          const t = p / Math.max(1, pointCount - 1);
          const hz = minHz + t * (maxHz - minHz);
          const i = binForHz(hz);
          const v = freqData[i] / 255;
          ctx.lineTo(x, plotBottom - v * plotH);
        }
        ctx.lineTo(plotX + plotW, plotBottom);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, plotY, 0, plotBottom);
        grad.addColorStop(0, c.gradTop);
        grad.addColorStop(1, c.gradBot);
        ctx.fillStyle = grad;
        ctx.fill();

        // Line on top
        ctx.strokeStyle = c.line;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let p = 0; p < pointCount; p++) {
          const x = plotX + (p / Math.max(1, pointCount - 1)) * plotW;
          const t = p / Math.max(1, pointCount - 1);
          const hz = minHz + t * (maxHz - minHz);
          const i = binForHz(hz);
          const v = freqData[i] / 255;
          const y = plotBottom - v * plotH;
          if (p === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [analyser, mode, theme, t]);

  return <canvas ref={canvasRef} width={width} height={height} className="w-full rounded-lg border border-surface-300" />;
}
