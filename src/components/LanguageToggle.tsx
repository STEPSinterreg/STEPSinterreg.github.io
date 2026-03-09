import type { RefObject } from "react";
import { useLocale } from "../i18n/LocaleContext";
import { translations } from "../i18n/translations";

type LanguageToggleProps = {
  buttonClass?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  containerRef?: RefObject<HTMLDivElement | null>;
};

export default function LanguageToggle({ buttonClass, open, onOpenChange, containerRef }: LanguageToggleProps) {
  const { locale, setLocale } = useLocale();
  const t = translations[locale];

  const options: { key: "da" | "de" | "en"; label: string; src: string }[] = [
    { key: "da", label: t["language.da"], src: "/flags/da.png" },
    { key: "de", label: t["language.de"], src: "/flags/de.png" },
    { key: "en", label: t["language.en"], src: "/flags/en.png" },
  ];

  const current = options.find((o) => o.key === locale) ?? options[0];
  const triggerClass = buttonClass ?? "inline-flex h-10 items-center gap-2 rounded-xl border border-slate-700 px-3 text-sm hover:bg-slate-900";

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => onOpenChange(!open)}
        className={triggerClass}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <img src={current.src} alt={current.label} className="h-4 w-6 rounded-sm object-cover" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-40 rounded-xl border border-slate-800 bg-slate-900 p-2 shadow-lg">
          <ul role="listbox" className="space-y-1">
            {options.map((opt) => (
              <li key={opt.key}>
                <button
                  onClick={() => {
                    setLocale(opt.key);
                    onOpenChange(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-slate-800 ${
                    locale === opt.key ? "bg-slate-800" : ""
                  }`}
                >
                  <img src={opt.src} alt={opt.label} className="h-4 w-6 rounded-sm object-cover" />
                  <span className="flex-1 text-left">{opt.label}</span>
                  {locale === opt.key && <span className="text-xs text-slate-300">✓</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
