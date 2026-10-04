import { AXES, EVENT_TYPES } from "../types";
import {
  AXIS_INFO,
  EVENT_NAMES,
  SHAPE_INFO,
  FAMILY_ORDER,
  HOW_TO_READ,
  WRITING,
  WRITING_STYLE,
  confidenceSentence,
  shapeInfo,
  shapeSentence,
  templateOf,
  templateSamples,
} from "../lib/definitions";
import { hasSeen, markSeen } from "../lib/storage";
import { blockStorage } from "./fixtures";

test("every axis and event has plain-words copy", () => {
  for (const a of AXES) {
    expect(AXIS_INFO[a].definition.length).toBeGreaterThan(20);
    expect(AXIS_INFO[a].low).toBeTruthy();
    expect(AXIS_INFO[a].high).toBeTruthy();
  }
  for (const e of EVENT_TYPES) expect(EVENT_NAMES[e]).toBeTruthy();
  expect(Object.keys(WRITING.kinds)).toEqual([
    "action",
    "dialogue",
    "description",
    "reflection",
    "exposition",
    "mixed",
  ]);
});

test("shape families are ordered with none last and have descriptions", () => {
  expect(FAMILY_ORDER[FAMILY_ORDER.length - 1]).toBe("none");
  for (const k of FAMILY_ORDER)
    expect(SHAPE_INFO[k as keyof typeof SHAPE_INFO].description).toBeTruthy();
  expect(SHAPE_INFO.rise_fall_rise.name).toBe("Cinderella");
  expect(SHAPE_INFO.rise.quote).toBeUndefined();
  expect(SHAPE_INFO.fall_rise.quote).toBe("In Vonnegut's own words.");
  expect(HOW_TO_READ).toHaveLength(3);
});

test("the third how-to-read note says how a pin is let go and that lines can be hovered", () => {
  expect(HOW_TO_READ[2].text).toMatch(/click it again, press Escape or close the passage/);
  expect(HOW_TO_READ[2].text).toMatch(/hover a line/i);
});

test("card sentences follow the state", () => {
  const base = { shape: "rise", caption: "Rags to Riches", r: 0.8, margin: 0.3 };
  expect(shapeSentence({ ...base, state: "named" })).toBe(
    "A steady climb from ill fortune to good.",
  );
  expect(confidenceSentence({ ...base, state: "named" })).toMatch(/strong match/i);
  expect(confidenceSentence({ ...base, state: "leans", r: 0.45, margin: 0.05 })).toMatch(/leans/i);
  expect(shapeSentence({ ...base, state: "none", shape: null })).toMatch(/Hamlet/);
});

test("a work is remembered as seen on this device", () => {
  expect(hasSeen("sos.seen.x")).toBe(false);
  markSeen("sos.seen.x");
  expect(hasSeen("sos.seen.x")).toBe(true);
});

test("with site data blocked nothing counts as seen and marking it does not throw", () => {
  blockStorage();
  expect(hasSeen("sos.seen.x")).toBe(false);
  expect(() => markSeen("sos.seen.x")).not.toThrow();
});

test("only a named or leaning shape this build knows has a template to sketch", () => {
  const base = { caption: "", r: 0.8, margin: 0.3 };
  expect(templateOf({ ...base, state: "named", shape: "rise" })?.(0)).toBe(-1);
  expect(templateOf({ ...base, state: "leans", shape: "fall_rise" })?.(0.5)).toBeCloseTo(-1);
  expect(templateOf({ ...base, state: "none", shape: "rise" })).toBeUndefined();
  expect(templateOf({ ...base, state: "named", shape: "spiral" })).toBeUndefined();
  expect(shapeInfo({ ...base, state: "none", shape: "rise" })).toBe(SHAPE_INFO.none);
  expect(shapeInfo({ ...base, state: "named", shape: "spiral" })).toBeUndefined();
});

test("a template is sampled at bin centers and scaled to a z-scored line's reach", () => {
  const s = templateSamples({ state: "named", shape: "rise" })!;
  expect(s).toHaveLength(100);
  expect(s[0]).toBeCloseTo(-Math.cos(Math.PI * 0.005) * 1.4);
  expect(s[99]).toBeCloseTo(-Math.cos(Math.PI * 0.995) * 1.4);
  expect(templateSamples({ state: "none", shape: "rise" })).toBeNull();
});

test("each kind of writing has a palette color and a pattern, action and exposition solid", () => {
  expect(Object.keys(WRITING_STYLE)).toEqual(Object.keys(WRITING.kinds));
  expect(Object.fromEntries(Object.entries(WRITING_STYLE).map(([k, s]) => [k, s.color]))).toEqual({
    action: "var(--ax-tension)",
    dialogue: "var(--ax-wonder)",
    description: "var(--ax-humor)",
    reflection: "var(--ax-dread)",
    exposition: "var(--ax-pace)",
    mixed: "var(--muted)",
  });
  expect(WRITING_STYLE.action.pattern).toBe("none");
  expect(WRITING_STYLE.exposition.pattern).toBe("none");
  expect(WRITING_STYLE.dialogue.pattern).toMatch(/^repeating-linear-gradient\(0deg/);
  expect(WRITING_STYLE.description.pattern).toMatch(/^radial-gradient/);
  expect(WRITING_STYLE.reflection.pattern).toMatch(/^repeating-linear-gradient\(45deg/);
  expect(WRITING_STYLE.mixed.pattern).toMatch(/^repeating-linear-gradient\(135deg/);
  const patterns = Object.values(WRITING_STYLE)
    .map((s) => s.pattern)
    .filter((p) => p !== "none");
  expect(new Set(patterns).size).toBe(patterns.length);
});
