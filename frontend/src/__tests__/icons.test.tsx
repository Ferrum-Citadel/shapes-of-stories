import { render } from "@testing-library/react";
import { EVENT_TYPES } from "../types";
import { ActionIcon, EVENT_PATHS, EventGlyph, Icon } from "../components/icons";

test("every event type has a distinct stroke-only glyph on the 24 grid and no text", () => {
  const seen = new Set<string>();
  for (const t of EVENT_TYPES) {
    const { container } = render(<EventGlyph type={t} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg.getAttribute("stroke-width")).toBe("1.75");
    expect(svg.textContent).toBe("");
    const d = Array.from(svg.querySelectorAll("path, circle, line"))
      .map((e) => e.outerHTML)
      .join("");
    expect(d.length).toBeGreaterThan(10);
    seen.add(d);
  }
  expect(seen.size).toBe(EVENT_TYPES.length);
});

test("ui icons render on their own 16 grid", () => {
  for (const name of ["close", "chevron", "replay", "question", "sun", "moon", "auto"] as const) {
    const { container } = render(<Icon name={name} />);
    expect(container.querySelector("svg")).toHaveAttribute("viewBox", "0 0 16 16");
  }
});

test("every glyph's path stays on the 24 grid, each subpath starting absolute", () => {
  for (const d of Object.values(EVENT_PATHS)) {
    expect(d).toMatch(/^M/);
    expect(d).not.toMatch(/m/);
    for (const [, x, y] of d.matchAll(/M(-?[\d.]+)[ ,]?(-?[\d.]+)/g)) {
      expect(Number(x)).toBeGreaterThanOrEqual(0);
      expect(Number(x)).toBeLessThanOrEqual(24);
      expect(Number(y)).toBeGreaterThanOrEqual(0);
      expect(Number(y)).toBeLessThanOrEqual(24);
    }
  }
});

test("an untitled glyph is hidden from assistive technology", () => {
  const { container } = render(<EventGlyph type="reveal" />);
  expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
});

test("the action icons render on the 24 grid like the event glyphs", () => {
  for (const name of ["bookmark", "link", "download", "image"] as const) {
    const svg = render(<ActionIcon name={name} />).container.querySelector("svg")!;
    expect(svg).toHaveAttribute("viewBox", "0 0 24 24");
    expect(svg).toHaveAttribute("stroke-width", "1.75");
  }
});
