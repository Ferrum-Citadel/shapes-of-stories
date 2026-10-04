import { render } from "@testing-library/react";
import ScoreBar from "../components/ScoreBar";
import { advance, stubReducedMotion } from "./fixtures";

const parts = (el: HTMLElement) => ({
  bar: el.querySelector<HTMLElement>("[data-bar]")!,
  fill: el.querySelector<HTMLElement>("[data-fill]"),
  range: el.querySelector<HTMLElement>("[data-range]"),
});

test("fills a 48 px track to the score out of 4, with the spread as a range, beside the number", () => {
  const { container } = render(<ScoreBar score={2.6} sd={0.5} color="var(--ax-fortune)" />);
  const { bar, fill, range } = parts(container);
  expect(bar).toHaveAttribute("aria-hidden", "true");
  expect(bar.style.width).toBe("48px");
  expect(bar.style.background).toBe("var(--rule)");
  expect(fill!.style.width).toBe("31.2px");
  expect(fill!.style.background).toBe("var(--ax-fortune)");
  // 2.1 to 3.1 on a 48 px track.
  expect(range!.style.left).toBe("25.2px");
  expect(range!.style.width).toBe("12px");
  expect(container).toHaveTextContent("2.6");
  expect(container.querySelector(".tabular-nums")).toHaveTextContent("2.6");
});

test("the range is clamped to the scale, and without a spread there is none", () => {
  const { container, rerender } = render(<ScoreBar score={3.8} sd={0.5} color="red" />);
  const { range } = parts(container);
  expect(range!.style.left).toBe("39.6px");
  expect(range!.style.width).toBe("8.4px");
  rerender(<ScoreBar score={1} color="red" />);
  expect(parts(container).range).toBeNull();
  expect(parts(container).fill!.style.width).toBe("12px");
});

test("a score not yet known keeps the track with a dash, and a label is what a reader hears", () => {
  const { container, rerender } = render(<ScoreBar score={null} color="red" />);
  expect(parts(container).fill).toBeNull();
  expect(parts(container).bar).toBeInTheDocument();
  expect(container).toHaveTextContent("–");
  rerender(<ScoreBar score={2.6} color="red" label="2.6 of 4, ill to good" />);
  expect(container.querySelector(".sr-only")).toHaveTextContent("2.6 of 4, ill to good");
  expect(container.querySelector(".tabular-nums")).toHaveAttribute("aria-hidden", "true");
});

describe("moving from one score to the next", () => {
  beforeEach(() =>
    vi.useFakeTimers({
      toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"],
    }),
  );
  const width = (el: HTMLElement) => parseFloat(parts(el).fill!.style.width);
  const number = (el: HTMLElement) => el.querySelector(".tabular-nums")!.textContent;

  test("a first score fills from nothing, the number counting with the bar", () => {
    const { container } = render(<ScoreBar score={2.6} sd={0.5} color="red" move />);
    expect(width(container)).toBe(0);
    expect(number(container)).toBe("0.0");
    expect(parts(container).range!.style.width).toBe("0px");
    advance(100);
    expect(width(container)).toBeGreaterThan(0);
    expect(width(container)).toBeLessThan(31.2);
    expect(Number(number(container))).toBeCloseTo((width(container) / 48) * 4, 0);
    advance(200);
    expect(parts(container).fill!.style.width).toBe("31.2px");
    expect(parts(container).range!.style.left).toBe("25.2px");
    expect(parts(container).range!.style.width).toBe("12px");
    expect(number(container)).toBe("2.6");
  });

  test("a new score mid-move starts from the value drawn at that moment, never jumping", () => {
    const { container, rerender } = render(<ScoreBar score={4} color="red" move />);
    advance(80);
    const mid = width(container);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(48);
    rerender(<ScoreBar score={1} color="red" move />);
    expect(width(container)).toBe(mid);
    advance(32);
    expect(width(container)).toBeLessThan(mid);
    expect(width(container)).toBeGreaterThan(12);
    advance(300);
    expect(parts(container).fill!.style.width).toBe("12px");
    expect(number(container)).toBe("1.0");
  });

  test("under reduced motion a score is drawn at once", () => {
    stubReducedMotion();
    const { container, rerender } = render(<ScoreBar score={2.6} color="red" move />);
    expect(parts(container).fill!.style.width).toBe("31.2px");
    rerender(<ScoreBar score={1} color="red" move />);
    expect(parts(container).fill!.style.width).toBe("12px");
    expect(number(container)).toBe("1.0");
    expect(vi.getTimerCount()).toBe(0);
  });
});
