import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type ThemeSetting = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

type ThemeContextValue = {
  setting: ThemeSetting;
  resolved: ResolvedTheme;
  setSetting: (s: ThemeSetting) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  setting: "system",
  resolved: "light",
  setSetting: () => {},
});

function resolveTheme(setting: ThemeSetting): ResolvedTheme {
  if (setting === "light" || setting === "dark") return setting;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getStoredSetting(): ThemeSetting {
  if (typeof window === "undefined") return "system";
  const v = localStorage.getItem("steps-theme");
  if (v === "light" || v === "dark" || v === "system") return v;
  return "system";
}

function applyToDOM(resolved: ResolvedTheme) {
  const root = document.documentElement;
  if (resolved === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [setting, setSettingState] = useState<ThemeSetting>(getStoredSetting);
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(setting));

  const setSetting = (s: ThemeSetting) => {
    setSettingState(s);
    localStorage.setItem("steps-theme", s);
    const r = resolveTheme(s);
    setResolved(r);
    applyToDOM(r);
  };

  useEffect(() => {
    applyToDOM(resolved);
  }, [resolved]);

  useEffect(() => {
    if (setting !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      const r = e.matches ? "dark" : "light";
      setResolved(r);
      applyToDOM(r);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [setting]);

  return (
    <ThemeContext.Provider value={{ setting, resolved, setSetting }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
