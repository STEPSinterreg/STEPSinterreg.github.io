import ExperienceCard from "../components/ExperienceCard";
import { experiences } from "../experiences/registry";
import { useLocale } from "../i18n/LocaleContext";
import { translations } from "../i18n/translations";

export default function Dashboard() {
  const { locale } = useLocale();
  const t = translations[locale];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-800 bg-slate-900/30 p-5">
        <h1 className="text-xl font-semibold">{t.dashboard_title}</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">{t.dashboard_desc}</p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {experiences.map((exp) => (
          <ExperienceCard key={exp.id} exp={exp} />
        ))}
      </section>
    </div>
  );
}
