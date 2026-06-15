import { Outlet, useLocation, useNavigate } from "react-router-dom";
import LanguageToggle from "../components/LanguageToggle";
import ThemeToggle, { SunIcon, MoonIcon, MonitorIcon } from "../components/ThemeToggle";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "../i18n/LocaleContext";
import { useTheme } from "../i18n/ThemeContext";
import { translations } from "../i18n/translations";

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);
  const languageMenuRef = useRef<HTMLDivElement | null>(null);
  const themeMenuRef = useRef<HTMLDivElement | null>(null);
  const isDashboard = location.pathname === "/";
  const isHearingLoss = location.pathname.startsWith("/experiences/hearing-loss");
  const search = new URLSearchParams(location.search);
  const isHearingLossLevel = isHearingLoss && search.get("screen") === "level";
  const isHearingLossCompare = isHearingLoss && search.get("screen") === "compare";
  const isHearingLossExperience = isHearingLoss && search.get("screen") === "experience";
  const isHearingLossLive = isHearingLoss && search.get("screen") === "live";
  const showHearingLossDevUnlock = isHearingLossExperience;
  const { locale } = useLocale();
  const { setting, setSetting } = useTheme();
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
    setThemeMenuOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;

      if (actionsMenuRef.current?.contains(target)) return;
      if (languageMenuRef.current?.contains(target)) return;
      if (themeMenuRef.current?.contains(target)) return;

      setActionsMenuOpen(false);
      setLanguageMenuOpen(false);
      setThemeMenuOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  const topBarButtonClass = "inline-flex h-full items-center justify-center px-3 text-sm text-white/80 transition-colors hover:bg-white/[0.12] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/50";

  const devButtonClass = "inline-flex h-full items-center justify-center px-3 text-sm text-amber-300 transition-colors hover:bg-amber-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400";

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

      {(isHearingLossCompare || isHearingLossExperience || isHearingLossLive) && (
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

      {!isDashboard && !isHearingLossLevel && !isHearingLossCompare && !isHearingLossExperience && !isHearingLossLive && (
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

  const themeOptions: { key: "light" | "dark" | "system"; label: string; Icon: React.FC<{ size?: number }> }[] = [
    { key: "light", label: "Light", Icon: SunIcon },
    { key: "dark", label: "Dark", Icon: MoonIcon },
    { key: "system", label: "System", Icon: MonitorIcon },
  ];

  return (
    <div className="min-h-screen bg-surface-100 text-gray-800">
      <header className="sticky top-0 z-10 border-b border-steps-700 bg-steps-600 shadow-lg">
        <div className="mx-auto flex max-w-6xl min-h-14 items-stretch justify-between px-4">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="flex items-center gap-3 px-2 -ml-2 transition-colors hover:bg-white/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/50"
          >
            <img
              src="/steps-art/SVGs/STEPS Logo White.svg"
              alt="STEPS"
              className="h-10 w-auto"
            />
          </button>

          <div className="relative flex items-stretch gap-0">
            <ThemeToggle
              buttonClass={topBarButtonClass}
              open={themeMenuOpen}
              onOpenChange={(open) => {
                setThemeMenuOpen(open);
                if (open) { setLanguageMenuOpen(false); setActionsMenuOpen(false); }
              }}
              containerRef={themeMenuRef}
            />

            <LanguageToggle
              buttonClass={topBarButtonClass}
              open={languageMenuOpen}
              onOpenChange={(open) => {
                setLanguageMenuOpen(open);
                if (open) { setActionsMenuOpen(false); setThemeMenuOpen(false); }
              }}
              containerRef={languageMenuRef}
            />

            {showHeaderActions && (
              <>
                <div className="hidden items-stretch gap-0 sm:flex">{headerActions}</div>

                <div className="sm:hidden" ref={actionsMenuRef}>
                  <button
                    type="button"
                    className="inline-flex h-full w-11 items-center justify-center text-white/80 transition-colors hover:bg-white/[0.12] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/50"
                    aria-label={t["app.openActionsMenu"]}
                    aria-haspopup="menu"
                    aria-expanded={actionsMenuOpen}
                    onClick={() => {
                      setActionsMenuOpen((open) => {
                        const next = !open;
                        if (next) { setLanguageMenuOpen(false); setThemeMenuOpen(false); }
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
                    <div className="absolute right-0 top-full z-20 mt-2 w-48 rounded-xl border border-surface-300 bg-white p-2 shadow-lg">
                      <div className="flex flex-col gap-1" role="menu" aria-label={t["app.actionsMenuTitle"]}>
                        {/* Theme picker in mobile menu */}
                        <div className="px-2 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Theme</div>
                        {themeOptions.map((opt) => (
                          <button
                            key={opt.key}
                            className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-gray-700 hover:bg-steps-50 ${
                              setting === opt.key ? "bg-steps-50 text-steps-700" : ""
                            }`}
                            onClick={() => {
                              setSetting(opt.key);
                              setActionsMenuOpen(false);
                            }}
                          >
                            <opt.Icon size={16} />
                            <span className="flex-1">{opt.label}</span>
                            {setting === opt.key && <span className="text-xs text-steps-600">✓</span>}
                          </button>
                        ))}

                        {/* Divider before nav actions */}
                        <div className="my-1 border-t border-surface-300" />

                        {!isDashboard && !isHearingLossLevel && showHearingLossDevUnlock && (
                          <button
                            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-gray-700 hover:bg-steps-50"
                            title={t["app.devUnlockAllTitle"]}
                            onClick={() => {
                              window.dispatchEvent(new CustomEvent("hearingLoss:unlockAll"));
                              setActionsMenuOpen(false);
                            }}
                          >
                            <span className="flex-1">{t["app.devUnlockAllButton"]}</span>
                          </button>
                        )}

                        {(isHearingLossCompare || isHearingLossExperience || isHearingLossLive) && (
                          <button
                            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-gray-700 hover:bg-steps-50"
                            onClick={() => {
                              navigate("/experiences/hearing-loss");
                              setActionsMenuOpen(false);
                            }}
                          >
                            <span className="flex-1">{t["hearingLossExperience.backToHearingMenu"]}</span>
                          </button>
                        )}

                        {!isDashboard && !isHearingLossLevel && !isHearingLossCompare && !isHearingLossExperience && !isHearingLossLive && (
                          <button
                            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-gray-700 hover:bg-steps-50"
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
                            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-gray-700 hover:bg-steps-50"
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
