import { render, screen } from "@testing-library/react";
import { useRef } from "react";
import { useDrawerReveal } from "../components/useDrawerReveal";
import { advance, stubReducedMotion } from "./fixtures";

// Each passage's content has its own height; a pinned height is what the box measures while it is set, as in a browser.
const HEIGHT: Record<string, number> = { "passage 0": 100, "passage 1": 300, "passage 2": 200 };

function Drawer({ beat }: { beat: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useDrawerReveal(beat, ref);
  return (
    <div ref={ref} data-testid="wrap">
      <p>passage {beat}</p>
    </div>
  );
}

const wrap = () => screen.getByTestId("wrap");

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      "setTimeout",
      "clearTimeout",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "performance",
    ],
  });
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.style.height ? parseFloat(this.style.height) : (HEIGHT[this.textContent] ?? 0);
  });
});

test("opening draws the passage at its own height, with nothing to glide", () => {
  render(<Drawer beat={0} />);
  expect(wrap().style.height).toBe("");
  expect(vi.getTimerCount()).toBe(0);
});

test("a step shows the new passage at once and glides the box from the old height to the new", () => {
  const { rerender } = render(<Drawer beat={0} />);
  rerender(<Drawer beat={1} />);
  expect(wrap()).toHaveTextContent("passage 1");
  expect(wrap().style.height).toBe("100px");
  expect(wrap().style.overflowY).toBe("clip");
  advance(110);
  const mid = parseFloat(wrap().style.height);
  expect(mid).toBeGreaterThan(100);
  expect(mid).toBeLessThan(300);
  advance(130);
  expect(wrap().style.height).toBe("");
  expect(wrap().style.overflowY).toBe("");
});

test("a step mid-glide starts from wherever the glide had got to, and a burst ends at the last height", () => {
  const { rerender } = render(<Drawer beat={0} />);
  rerender(<Drawer beat={1} />);
  advance(100);
  const held = parseFloat(wrap().style.height);
  expect(held).toBeGreaterThan(100);
  expect(held).toBeLessThan(300);
  rerender(<Drawer beat={2} />);
  expect(wrap()).toHaveTextContent("passage 2");
  expect(parseFloat(wrap().style.height)).toBe(held);
  for (const beat of [0, 1, 2, 0]) {
    advance(16);
    rerender(<Drawer beat={beat} />);
  }
  advance(220);
  expect(wrap().style.height).not.toBe("");
  advance(20);
  expect(wrap()).toHaveTextContent("passage 0");
  expect(wrap().style.height).toBe("");
});

test("a step after a finished glide starts from the height the glide ended at", () => {
  const { rerender } = render(<Drawer beat={0} />);
  rerender(<Drawer beat={1} />);
  advance(240);
  expect(wrap().style.height).toBe("");
  rerender(<Drawer beat={2} />);
  expect(wrap().style.height).toBe("300px");
});

test("a step to content of the same height leaves the box alone", () => {
  HEIGHT["passage 3"] = 100;
  const { rerender } = render(<Drawer beat={0} />);
  rerender(<Drawer beat={3} />);
  expect(wrap().style.height).toBe("");
  expect(vi.getTimerCount()).toBe(0);
});

test("under reduced motion a step swaps at once, with nothing to time", () => {
  stubReducedMotion();
  const { rerender } = render(<Drawer beat={0} />);
  rerender(<Drawer beat={1} />);
  expect(wrap()).toHaveTextContent("passage 1");
  expect(wrap().style.height).toBe("");
  expect(vi.getTimerCount()).toBe(0);
});

test("an instant swap that cuts a glide short leaves nothing pinned", () => {
  const { rerender } = render(<Drawer beat={0} />);
  rerender(<Drawer beat={1} />);
  advance(100);
  expect(wrap().style.height).not.toBe("");
  stubReducedMotion();
  rerender(<Drawer beat={2} />);
  expect(wrap()).toHaveTextContent("passage 2");
  expect(wrap().style.height).toBe("");
  expect(wrap().style.overflowY).toBe("");
  advance(300);
  expect(wrap().style.height).toBe("");
});

test("closing the drawer mid-glide leaves no timer or frame running", () => {
  const { rerender, unmount } = render(<Drawer beat={0} />);
  rerender(<Drawer beat={1} />);
  advance(100);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
