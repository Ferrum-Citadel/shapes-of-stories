import { useEffect, useState } from "react";
import { readStore, writeStore } from "./storage";

// Dark unless light or the system's scheme was chosen; public/theme.js repeats this choice before the bundle loads, so the first paint has the right theme.
export function resolveTheme(stored: string | null, systemDark: boolean): "light" | "dark" {
  return stored === "light" || (stored === "system" && !systemDark) ? "light" : "dark";
}

type Choice = "system" | "light" | "dark";
const KEY = "sos.theme";
const DARK = "(prefers-color-scheme: dark)";
const NEXT = { dark: "light", light: "system", system: "dark" } as const;

function storedChoice(): Choice {
  const s = readStore("localStorage", KEY);
  return s === "light" || s === "system" ? s : "dark";
}

export function useTheme(): { choice: Choice; cycle(): void } {
  const [choice, setChoice] = useState(storedChoice);
  useEffect(() => {
    const m = window.matchMedia(DARK);
    const apply = () => {
      document.documentElement.dataset.theme = resolveTheme(choice, m.matches);
    };
    apply();
    if (choice !== "system") return;
    m.addEventListener("change", apply);
    return () => m.removeEventListener("change", apply);
  }, [choice]);
  const cycle = () => {
    const next = NEXT[choice];
    // Blocked storage still lets the choice hold for this visit.
    writeStore("localStorage", KEY, next === "dark" ? null : next);
    setChoice(next);
  };
  return { choice, cycle };
}
