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
};

export default function LabeledSlider({ id, label, min, max, step = 1, value, displayValue, onChange, unit }: Props) {
  const v = typeof displayValue === "number" ? displayValue : value;
  const display = Number.isFinite(v) ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : "";
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label} <span className="text-xs text-slate-400">{display}{unit ? ` ${unit}` : ""}</span>
      </label>
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
