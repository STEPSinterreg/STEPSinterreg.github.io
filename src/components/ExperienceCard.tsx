import { useNavigate } from "react-router-dom";
import type { Experience } from "../experiences/registry";
import { useLocale } from "../i18n/LocaleContext";
import { translations } from "../i18n/translations";

export default function ExperienceCard({ exp }: { exp: Experience }) {
  const navigate = useNavigate();
  const { locale } = useLocale();

  const t = translations[locale];

  const statusLabel: Record<string, string> = {
    prototype: t["status_prototype"],
    beta: t["status_beta"],
    live: t["status_live"],
  };

  return (
    <button
      onClick={() => navigate(exp.route)}
      className="group flex w-full flex-col rounded-2xl border border-surface-300 bg-white p-5 text-left shadow-sm transition hover:border-steps-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        {exp.iconSrc ? (
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-steps-50 transition group-hover:bg-steps-100">
            <img
              src={exp.iconSrc}
              alt={t[exp.titleKey] ?? exp.id}
              className="h-8 w-8 object-contain brightness-0"
              loading="lazy"
              draggable={false}
            />
          </div>
        ) : (
          <div className="h-12 w-12 rounded-2xl bg-steps-50 transition group-hover:bg-steps-100" />
        )}
        {exp.status && (
          <span className="rounded-full border border-steps-200 bg-steps-50 px-2 py-1 text-xs text-steps-700">
            {statusLabel[exp.status] ?? exp.status}
          </span>
        )}
      </div>

      <div className="mt-4">
        <div className="text-base font-semibold text-gray-800">{t[exp.titleKey]}</div>
        <div className="mt-1 text-sm text-gray-500">{t[exp.descriptionKey]}</div>
      </div>

      <div className="mt-4 text-sm text-steps-600 underline-offset-4 group-hover:underline">
        {t["open_experience"]}
      </div>
    </button>
  );
}
