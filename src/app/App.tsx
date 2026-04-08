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
  const isHearingLossCompare = isHearingLoss && search.get("screen") === "compare";
  const isHearingLossExperience = isHearingLoss && search.get("screen") === "experience";
  const isHearingLossMenu = isHearingLoss && !isHearingLossLevel;
  const showHearingLossDevUnlock = isHearingLossExperience;
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

  // Full-height bar button: parent uses items-stretch + fixed min-height so every
  // button fills the entire topbar. No rounded corners, no gap between siblings.
  const topBarButtonClass = "inline-flex h-full items-center justify-center px-3 text-sm text-slate-300 transition-colors hover:bg-white/[0.06] hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400";

  // Dev-unlock still gets a faint amber tint so it stays visually distinct.
  const devButtonClass = "inline-flex h-full items-center justify-center px-3 text-sm text-amber-400 transition-colors hover:bg-amber-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-500";

  const headerActions = (
    <>
      {!isDashboard && !isHearingLossLevel && showHearingLossDevUnlock && (
        <button
          className={devButtonClass}
          title={t["app.devUnlockAllTitle"]}
          onClick={() => {
            window.dispatchEvent(new CustomEvent("hearingLoss:unlockAll"));
            setActionsMenuOpen(false);
          }}
        >
          {t["app.devUnlockAllButton"]}
        </button>
      )}

      {/* Compare / Experience sub-screens → back to hearing landing */}
      {(isHearingLossCompare || isHearingLossExperience) && (
        <button
          className={topBarButtonClass}
          onClick={() => {
            navigate("/experiences/hearing-loss");
            setActionsMenuOpen(false);
          }}
        >
          {t["hearingLossExperience.backToHearingMenu"]}
        </button>
      )}

      {/* Hearing landing + all other non-dashboard, non-level pages → back to dashboard */}
      {!isDashboard && !isHearingLossLevel && !isHearingLossCompare && !isHearingLossExperience && (
        <button
          className={topBarButtonClass}
          onClick={() => {
            navigate("/");
            setActionsMenuOpen(false);
          }}
        >
          {t["back_to_dashboard"]}
        </button>
      )}

      {/* Level → back to experience menu */}
      {isHearingLossLevel && (
        <button
          className={topBarButtonClass}
          onClick={() => {
            navigate("/experiences/hearing-loss?screen=experience");
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
        <div className="mx-auto flex max-w-6xl min-h-14 items-stretch justify-between px-4">
          {/* Logo + title — full-height, no rounded, navigates home on click */}
          <button
            type="button"
            onClick={() => navigate("/")}
            className="flex items-center gap-3 px-2 -ml-2 transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400"
          >
            <img src={`/icons/${locale}.png`} alt={t["common.logoAlt"]} className="h-8 w-8 rounded-xl object-cover" />
            <div className="text-left">
              <div className="text-sm font-semibold leading-4">{t["app_name"]}</div>
              <div className="text-xs text-slate-400">{t["app_subtitle"]}</div>
            </div>
          </button>

          <div className="relative flex items-stretch gap-0">
            <LanguageToggle
              buttonClass={topBarButtonClass}
              open={languageMenuOpen}
              onOpenChange={(open) => {
                setLanguageMenuOpen(open);
                if (open) setActionsMenuOpen(false);
              }}
              containerRef={languageMenuRef}
            />

            {showHeaderActions && (
              <>
                <div className="hidden items-stretch gap-0 sm:flex">{headerActions}</div>

                <div className="sm:hidden" ref={actionsMenuRef}>
                  <button
                    type="button"
                    className="inline-flex h-full w-11 items-center justify-center text-slate-300 transition-colors hover:bg-white/[0.06] hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400"
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

                        {(isHearingLossCompare || isHearingLossExperience) && (
                          <button
                            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-slate-800"
                            onClick={() => {
                              navigate("/experiences/hearing-loss");
                              setActionsMenuOpen(false);
                            }}
                          >
                            <span className="flex-1">{t["hearingLossExperience.backToHearingMenu"]}</span>
                          </button>
                        )}

                        {!isDashboard && !isHearingLossLevel && !isHearingLossCompare && !isHearingLossExperience && (
                          <button
                            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-slate-800"
                            onClick={() => {
                              navigate("/");
                              setActionsMenuOpen(false);
                            }}
                          >
                            <span className="flex-1">{t["back_to_dashboard"]}</span>
                          </button>
                        )}

                        {isHearingLossLevel && (
                          <button
                            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-slate-800"
                            onClick={() => {
                              navigate("/experiences/hearing-loss?screen=experience");
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
