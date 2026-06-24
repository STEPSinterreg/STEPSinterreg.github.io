type Props = {
  id?: string;
  label: string;
  min: number;
  max: number;
  step?: number | "any";
  value: number;
  displayValue?: number;
  onChange: (v: number) => void;
  unit?: string;
  showDirectionBars?: boolean;
  directionBarLabel?: string;
  directionBarCount?: number;
};

export default function LabeledSlider({
  id,
  label,
  min,
  max,
  step = 1,
  value,
  displayValue,
  onChange,
  unit,
  showDirectionBars,
  directionBarLabel,
  directionBarCount = 20,
}: Props) {
  const v = typeof displayValue === "number" ? displayValue : value;
  const display = Number.isFinite(v) ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : "";
  const bars = Math.max(1, Math.round(directionBarCount));
  const value01 = (() => {
    if (!Number.isFinite(value)) return 0;
    const denom = max - min;
    if (!Number.isFinite(denom) || denom <= 0) return 0;
    return Math.max(0, Math.min(1, (value - min) / denom));
  })();
  // Include the bar under the knob to avoid a "delayed" fill feel.
  const activeBars = Math.max(0, Math.min(bars, Math.floor(value01 * bars) + 1));
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-gray-700">
        {label} <span className="text-xs text-gray-400">{display}{unit ? ` ${unit}` : ""}</span>
      </label>

      {showDirectionBars ? (
        <div className="flex h-10 w-full items-end gap-1">
          {Array.from({ length: bars }).map((_, i) => {
            const midpoint = min + ((i + 0.5) / bars) * (max - min);
            const isActive = i < activeBars;
            return (
              <button
                key={i}
                type="button"
                aria-label={
                  directionBarLabel
                    ? `${directionBarLabel}: ${Math.round(midpoint)}${unit ? ` ${unit}` : ""}`
                    : `${Math.round(midpoint)}${unit ? ` ${unit}` : ""}`
                }
                onClick={() => onChange(midpoint)}
                className={
                  "flex-1 rounded-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steps-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-50 " +
                  (isActive
                    ? "bg-steps-400/80 hover:bg-steps-500"
                    : "bg-surface-300/70 hover:bg-surface-400")
                }
                style={{ height: `${25 + (i / Math.max(1, bars - 1)) * 75}%` }}
              />
            );
          })}
        </div>
      ) : null}

      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </div>
  );
}
