import type { RefObject } from "react";
import { useTheme } from "../i18n/ThemeContext";

type ThemeToggleProps = {
  buttonClass?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  containerRef?: RefObject<HTMLDivElement | null>;
};

function SunIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function MonitorIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

const TRIGGER_ICON = {
  light: SunIcon,
  dark: MoonIcon,
  system: MonitorIcon,
} as const;

export default function ThemeToggle({ buttonClass, open, onOpenChange, containerRef }: ThemeToggleProps) {
  const { setting, setSetting } = useTheme();

  const options: { key: "light" | "dark" | "system"; label: string; Icon: typeof SunIcon }[] = [
    { key: "light", label: "Light", Icon: SunIcon },
    { key: "dark", label: "Dark", Icon: MoonIcon },
    { key: "system", label: "System", Icon: MonitorIcon },
  ];

  const TriggerIcon = TRIGGER_ICON[setting];
  const triggerClass = buttonClass ?? "inline-flex h-10 items-center gap-2 rounded-xl border border-surface-300 px-3 text-sm hover:bg-surface-200";

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => onOpenChange(!open)}
        className={triggerClass}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Theme"
      >
        <TriggerIcon />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-36 rounded-xl border border-surface-300 bg-white p-2 shadow-lg">
          <ul role="listbox" className="space-y-1">
            {options.map((opt) => (
              <li key={opt.key}>
                <button
                  onClick={() => {
                    setSetting(opt.key);
                    onOpenChange(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-gray-700 hover:bg-steps-50 ${
                    setting === opt.key ? "bg-steps-50 text-steps-700" : ""
                  }`}
                >
                  <opt.Icon size={16} />
                  <span className="flex-1 text-left">{opt.label}</span>
                  {setting === opt.key && <span className="text-xs text-steps-600">✓</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export { SunIcon, MoonIcon, MonitorIcon };
