import { useNavigate } from "react-router-dom";
import type { Experience } from "../experiences/registry";
import { useLocale } from "../i18n/LocaleContext";
import { translations } from "../i18n/translations";

export default function ExperienceCard({ exp }: { exp: Experience }) {
  const navigate = useNavigate();
  const { locale } = useLocale();

  const t = translations[locale];

  const statusLabel: Record<string, string> = {
    prototype: t.status_prototype,
    beta: t.status_beta,
    live: t.status_live,
  };

  return (
    <button
      onClick={() => navigate(exp.route)}
      className="group flex w-full flex-col rounded-2xl border border-slate-800 bg-slate-900/40 p-5 text-left shadow-sm transition hover:border-slate-600 hover:bg-slate-900/70"
    >
      <div className="flex items-start justify-between gap-3">
        {exp.iconSrc ? (
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800 transition group-hover:bg-slate-700">
            <img
              src={exp.iconSrc}
              alt={t[exp.titleKey] ?? exp.id}
              className="h-8 w-8 object-contain"
              loading="lazy"
              draggable={false}
            />
          </div>
        ) : (
          <div className="h-12 w-12 rounded-2xl bg-slate-800 transition group-hover:bg-slate-700" />
        )}
        {exp.status && (
          <span className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-300">
            {statusLabel[exp.status] ?? exp.status}
          </span>
        )}
      </div>

      <div className="mt-4">
        <div className="text-base font-semibold">{t[exp.titleKey]}</div>
        <div className="mt-1 text-sm text-slate-400">{t[exp.descriptionKey]}</div>
      </div>

      <div className="mt-4 text-sm text-slate-300 underline-offset-4 group-hover:underline">
        {t.open_experience}
      </div>
    </button>
  );
}
