import { Outlet, useLocation, useNavigate } from "react-router-dom";
import LanguageToggle from "../components/LanguageToggle";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "../i18n/LocaleContext";
import { translations } from "../i18n/translations";

// Developer/testing controls.

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);
  const languageMenuRef = useRef<HTMLDivElement | null>(null);
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
    setLanguageMenuOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;

      if (actionsMenuRef.current?.contains(target)) return;
      if (languageMenuRef.current?.contains(target)) return;

      setActionsMenuOpen(false);
      setLanguageMenuOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

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
            <LanguageToggle
              buttonClass={`${topBarButtonClass} border-slate-700`}
              open={languageMenuOpen}
              onOpenChange={(open) => {
                setLanguageMenuOpen(open);
                if (open) setActionsMenuOpen(false);
              }}
              containerRef={languageMenuRef}
            />

            {showHeaderActions && (
              <>
                <div className="hidden items-center gap-2 sm:flex">{headerActions}</div>

                <div className="sm:hidden" ref={actionsMenuRef}>
                  <button
                    type="button"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 hover:bg-slate-900"
                    aria-label={t["app.openActionsMenu"]}
                    aria-haspopup="menu"
                    aria-expanded={actionsMenuOpen}
                    onClick={() => {
                      setActionsMenuOpen((open) => {
                        const next = !open;
                        if (next) setLanguageMenuOpen(false);
                        return next;
                      });
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <line x1="4" y1="7" x2="20" y2="7" />
                      <line x1="4" y1="12" x2="20" y2="12" />
                      <line x1="4" y1="17" x2="20" y2="17" />
                    </svg>
                  </button>

                  {actionsMenuOpen && (
                    <div className="absolute right-0 top-full z-20 mt-2 w-48 rounded-xl border border-slate-800 bg-slate-900 p-2 shadow-lg">
                      <div className="flex flex-col gap-2" role="menu" aria-label={t["app.actionsMenuTitle"]}>
                        {!isDashboard && !isHearingLossLevel && showHearingLossDevUnlock && (
                          <button
                            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-slate-800"
                            title={t["app.devUnlockAllTitle"]}
                            onClick={() => {
                              window.dispatchEvent(new CustomEvent("hearingLoss:unlockAll"));
                              setActionsMenuOpen(false);
                            }}
                          >
                            <span className="flex-1">{t["app.devUnlockAllButton"]}</span>
                          </button>
                        )}

                        {!isDashboard && !isHearingLossLevel && (
                          <button
                            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-slate-800"
                            onClick={() => {
                              navigate("/");
                              setActionsMenuOpen(false);
                            }}
                          >
                            <span className="flex-1">{t.back_to_dashboard}</span>
                          </button>
                        )}

                        {isHearingLossLevel && (
                          <button
                            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-slate-800"
                            onClick={() => {
                              navigate("/experiences/hearing-loss");
                              setActionsMenuOpen(false);
                            }}
                          >
                            <span className="flex-1">{t["hearingLossExperience.backToMainMenu"]}</span>
                          </button>
                        )}
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
