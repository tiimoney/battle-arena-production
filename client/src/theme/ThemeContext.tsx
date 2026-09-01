import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

// Mirrors AppPreferencesService: device-local, independent of account data.
const STORAGE_KEY = "league_tracker_dark_mode_v1";

interface ThemeContextValue {
  isDarkMode: boolean;
  toggleThemeMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function loadInitial(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDarkMode, setIsDarkMode] = useState<boolean>(loadInitial);

  useEffect(() => {
    document.documentElement.dataset.theme = isDarkMode ? "dark" : "light";
  }, [isDarkMode]);

  const toggleThemeMode = useCallback(() => {
    setIsDarkMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // ignore -- private browsing / storage disabled
      }
      return next;
    });
  }, []);

  return <ThemeContext.Provider value={{ isDarkMode, toggleThemeMode }}>{children}</ThemeContext.Provider>;
}

export function useThemeMode(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useThemeMode must be used within a ThemeProvider");
  }
  return ctx;
}
