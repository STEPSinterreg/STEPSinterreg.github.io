import ExperienceCard from "../components/ExperienceCard";
import { experiences } from "../experiences/registry";
import { useLocale } from "../i18n/LocaleContext";
import { translations } from "../i18n/translations";

export default function Dashboard() {
  const { locale } = useLocale();
  const t = translations[locale];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-surface-300 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <img
            src="/steps-art/SVGs/STEPS Logo Full Text Purple.svg"
            alt="STEPS"
            className="h-24 w-auto sm:h-28 dark:brightness-0 dark:invert"
          />
          <div>
            <h1 className="text-xl font-semibold text-steps-600">{t["dashboard_title"]}</h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-500">{t["dashboard_desc"]}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {experiences.map((exp) => (
          <ExperienceCard key={exp.id} exp={exp} />
        ))}
      </section>
    </div>
  );
}
