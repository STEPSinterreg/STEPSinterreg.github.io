import { Outlet, useLocation, useNavigate } from "react-router-dom";
import LanguageToggle from "../components/LanguageToggle";
import { useEffect } from "react";
import { useLocale } from "../i18n/LocaleContext";
import { translations } from "../i18n/translations";

// Developer/testing controls.

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const isDashboard = location.pathname === "/";
  const isHearingLoss = location.pathname.startsWith("/experiences/hearing-loss");
  const search = new URLSearchParams(location.search);
  const isHearingLossLevel = isHearingLoss && search.get("screen") === "level";
  const isHearingLossMenu = isHearingLoss && !isHearingLossLevel;
  const showHearingLossDevUnlock = isHearingLossMenu;
  const { locale } = useLocale();
  const t = translations[locale];

  useEffect(() => {
    const href = `/icons/${locale}.png`;
    let link: HTMLLinkElement | null = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = href;
  }, [locale]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <img src={`/icons/${locale}.png`} alt={t["common.logoAlt"]} className="h-8 w-8 rounded-xl object-cover" />
            <div>
              <div className="text-sm font-semibold leading-4">{t.app_name}</div>
              <div className="text-xs text-slate-400">{t.app_subtitle}</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <LanguageToggle />

            {!isDashboard && !isHearingLossLevel && (
              <div className="flex items-center gap-2">
                {showHearingLossDevUnlock && (
                  <button
                    className="rounded-xl border border-amber-700 px-3 py-2 text-sm hover:bg-slate-900"
                    title={t["app.devUnlockAllTitle"]}
                    onClick={() => window.dispatchEvent(new CustomEvent("hearingLoss:unlockAll"))}
                  >
                    {t["app.devUnlockAllButton"]}
                  </button>
                )}

                <button
                  className="rounded-xl border border-slate-700 px-3 py-2 text-sm hover:bg-slate-900"
                  onClick={() => navigate("/")}
                >
                  {t.back_to_dashboard}
                </button>
              </div>
            )}

            {isHearingLossLevel && (
              <div className="flex items-center gap-2">
                <button
                  className="rounded-xl border border-slate-700 px-3 py-2 text-sm hover:bg-slate-900"
                  onClick={() => navigate("/experiences/hearing-loss")}
                >
                  {t["hearingLossExperience.backToMainMenu"]}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
