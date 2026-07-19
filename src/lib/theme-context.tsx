import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";

export const THEMES = [
  { id: "amber", label: "Amber Night", swatch: "oklch(0.74 0.14 75)", bg: "oklch(0.165 0.006 60)" },
  { id: "ocean", label: "Ocean Blue", swatch: "oklch(0.68 0.14 220)", bg: "oklch(0.16 0.02 235)" },
  { id: "forest", label: "Forest", swatch: "oklch(0.65 0.12 150)", bg: "oklch(0.155 0.015 150)" },
  { id: "violet", label: "Midnight Violet", swatch: "oklch(0.62 0.19 275)", bg: "oklch(0.15 0.02 260)" },
  { id: "light", label: "Light", swatch: "oklch(0.36 0.11 255)", bg: "oklch(0.985 0.005 85)" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

const STORAGE_KEY = "studyflow-theme";
const DEFAULT_THEME: ThemeId = "amber";

function applyTheme(theme: ThemeId) {
  const root = document.documentElement;
  if (theme === "light") {
    root.classList.remove("dark");
    root.removeAttribute("data-theme");
  } else {
    root.classList.add("dark");
    root.setAttribute("data-theme", theme);
  }
}

const ThemeContext = createContext<{ theme: ThemeId; setTheme: (t: ThemeId) => void }>({
  theme: DEFAULT_THEME,
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [theme, setThemeState] = useState<ThemeId>(DEFAULT_THEME);

  // Apply saved local theme immediately on mount (no server round-trip needed
  // for the common case of "same device as last time").
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeId | null;
    if (stored && THEMES.some((t) => t.id === stored)) {
      setThemeState(stored);
      applyTheme(stored);
    }
  }, []);

  // If signed in, let the user's saved Firestore preference win (so theme
  // follows them across devices), unless they haven't set one yet.
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      const remote = snap.data()?.theme as ThemeId | undefined;
      if (remote && THEMES.some((t) => t.id === remote)) {
        setThemeState(remote);
        applyTheme(remote);
        localStorage.setItem(STORAGE_KEY, remote);
      }
    });
    return () => unsub();
  }, [user?.uid]);

  const setTheme = (t: ThemeId) => {
    setThemeState(t);
    applyTheme(t);
    localStorage.setItem(STORAGE_KEY, t);
    if (user?.uid) {
      setDoc(doc(db, "users", user.uid), { theme: t }, { merge: true }).catch(() => {});
    }
  };

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
