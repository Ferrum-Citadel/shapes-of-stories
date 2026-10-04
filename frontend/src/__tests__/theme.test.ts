/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, renderHook } from "@testing-library/react";
import { resolveTheme, useTheme } from "../lib/theme";

const script = readFileSync(resolve(__dirname, "../../public/theme.js"), "utf8");

test("with no stored choice the site is dark, a stored light wins, and a stored system follows the system", () => {
  expect(resolveTheme(null, false)).toBe("dark");
  expect(resolveTheme(null, true)).toBe("dark");
  expect(resolveTheme("dark", false)).toBe("dark");
  expect(resolveTheme("light", true)).toBe("light");
  expect(resolveTheme("system", true)).toBe("dark");
  expect(resolveTheme("system", false)).toBe("light");
  expect(resolveTheme("sepia", false)).toBe("dark");
});

// Runs the pre-paint script against a stubbed page and returns the theme it set and whether it listened to the system.
function runScript(stored: string | null, systemDark: boolean, blocked = false) {
  let listened = false;
  const root = { dataset: {} as Record<string, string> };
  new Function("matchMedia", "localStorage", "document", script)(
    () => ({
      matches: systemDark,
      addEventListener: () => (listened = true),
      addListener: () => (listened = true),
    }),
    {
      getItem: () => {
        if (blocked) throw new Error("blocked");
        return stored;
      },
    },
    { documentElement: root },
  );
  return { theme: root.dataset.theme, listened };
}

test("the pre-paint script makes the same choice as resolveTheme", () => {
  for (const stored of ["light", "dark", "system", null, "sepia"])
    for (const systemDark of [true, false])
      expect(runScript(stored, systemDark).theme).toBe(resolveTheme(stored, systemDark));
});

test("the pre-paint script survives blocked storage and leaves following the system to the page", () => {
  expect(runScript(null, false, true).theme).toBe("dark");
  expect(runScript("system", false).listened).toBe(false);
});

// A system scheme the test can turn, counting who listens to it.
function stubSystem(dark: boolean) {
  const listeners = new Set<() => void>();
  const media = {
    get matches() {
      return dark;
    },
    addEventListener: (_: string, f: () => void) => listeners.add(f),
    removeEventListener: (_: string, f: () => void) => listeners.delete(f),
  };
  vi.stubGlobal("matchMedia", () => media);
  return {
    listeners,
    turn: (next: boolean) => {
      dark = next;
      listeners.forEach((f) => f());
    },
  };
}

test("a stored choice is read back on load, and the system is not followed while it holds", () => {
  localStorage.setItem("sos.theme", "light");
  const system = stubSystem(true);
  const { result } = renderHook(() => useTheme());
  expect(result.current.choice).toBe("light");
  expect(document.documentElement.dataset.theme).toBe("light");
  expect(system.listeners.size).toBe(0);
});

test("with nothing stored the site is dark, whatever the system prefers", () => {
  const system = stubSystem(false);
  const { result } = renderHook(() => useTheme());
  expect(result.current.choice).toBe("dark");
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(system.listeners.size).toBe(0);
});

test("cycling goes dark, light, system and back, storing the choice and following the system only when it is the choice", () => {
  const system = stubSystem(false);
  const { result } = renderHook(() => useTheme());
  const root = document.documentElement;
  expect(result.current.choice).toBe("dark");
  expect(root.dataset.theme).toBe("dark");

  act(() => result.current.cycle());
  expect(result.current.choice).toBe("light");
  expect(localStorage.getItem("sos.theme")).toBe("light");
  expect(root.dataset.theme).toBe("light");
  system.turn(true);
  expect(root.dataset.theme).toBe("light");

  act(() => result.current.cycle());
  expect(result.current.choice).toBe("system");
  expect(localStorage.getItem("sos.theme")).toBe("system");
  expect(root.dataset.theme).toBe("dark");
  system.turn(false);
  expect(root.dataset.theme).toBe("light");

  act(() => result.current.cycle());
  expect(result.current.choice).toBe("dark");
  expect(localStorage.getItem("sos.theme")).toBeNull();
  expect(root.dataset.theme).toBe("dark");
  expect(system.listeners.size).toBe(0);
});

test("blocked storage still lets the theme change for the visit", () => {
  stubSystem(true);
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  const { result } = renderHook(() => useTheme());
  expect(result.current.choice).toBe("dark");
  expect(document.documentElement.dataset.theme).toBe("dark");
  act(() => result.current.cycle());
  expect(result.current.choice).toBe("light");
  expect(document.documentElement.dataset.theme).toBe("light");
});
