import { Outlet, useLocation, useNavigate } from "react-router-dom";
import LanguageToggle from "../components/LanguageToggle";
import { useEffect, useState } from "react";
import { useLocale } from "../i18n/LocaleContext";
import { translations } from "../i18n/translations";

// Developer/testing controls.

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
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

  useEffect(() => {
    setActionsMenuOpen(false);
  }, [location.pathname, location.search]);

  const topBarButtonClass = "inline-flex h-10 items-center justify-center rounded-xl border px-3 text-sm hover:bg-slate-900";

  const headerActions = (
    <>
      {!isDashboard && !isHearingLossLevel && showHearingLossDevUnlock && (
        <button
          className={`${topBarButtonClass} border-amber-700`}
          title={t["app.devUnlockAllTitle"]}
          onClick={() => {
            window.dispatchEvent(new CustomEvent("hearingLoss:unlockAll"));
            setActionsMenuOpen(false);
          }}
        >
          {t["app.devUnlockAllButton"]}
        </button>
      )}

      {!isDashboard && !isHearingLossLevel && (
        <button
          className={`${topBarButtonClass} border-slate-700`}
          onClick={() => {
            navigate("/");
            setActionsMenuOpen(false);
          }}
        >
          {t.back_to_dashboard}
        </button>
      )}

      {isHearingLossLevel && (
        <button
          className={`${topBarButtonClass} border-slate-700`}
          onClick={() => {
            navigate("/experiences/hearing-loss");
            setActionsMenuOpen(false);
          }}
        >
          {t["hearingLossExperience.backToMainMenu"]}
        </button>
      )}
    </>
  );

  const showHeaderActions = !isDashboard || isHearingLossLevel;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <img src={`/icons/${locale}.png`} alt={t["common.logoAlt"]} className="h-8 w-8 rounded-xl object-cover" />
            <div>
              <div className="text-sm font-semibold leading-4">{t.app_name}</div>
              <div className="text-xs text-slate-400">{t.app_subtitle}</div>
            </div>
          </div>

          <div className="relative flex items-center gap-2 sm:gap-3">
            <LanguageToggle buttonClass={`${topBarButtonClass} border-slate-700`} />

            {showHeaderActions && (
              <>
                <div className="hidden items-center gap-2 sm:flex">{headerActions}</div>

                <div className="sm:hidden">
                  <button
                    type="button"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 hover:bg-slate-900"
                    aria-label={t["app.openActionsMenu"]}
                    aria-haspopup="menu"
                    aria-expanded={actionsMenuOpen}
                    onClick={() => setActionsMenuOpen((open) => !open)}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <line x1="4" y1="7" x2="20" y2="7" />
                      <line x1="4" y1="12" x2="20" y2="12" />
                      <line x1="4" y1="17" x2="20" y2="17" />
                    </svg>
                  </button>

                  {actionsMenuOpen && (
                    <div className="absolute right-12 top-full z-20 mt-2 min-w-56 rounded-2xl border border-slate-800 bg-slate-950 p-2 shadow-2xl">
                      <div className="px-2 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        {t["app.actionsMenuTitle"]}
                      </div>
                      <div className="mt-1 flex flex-col gap-2" role="menu" aria-label={t["app.actionsMenuTitle"]}>
                        {headerActions}
                      </div>
                    </div>
                  )}
                </div>
              </>
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
