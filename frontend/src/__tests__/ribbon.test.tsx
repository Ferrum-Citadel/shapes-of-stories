import { render, fireEvent, screen } from "@testing-library/react";
import EventRibbon, { EventLegend } from "../chart/EventRibbon";
import { fakeStructure, stubReducedMotion } from "./fixtures";
import { wordsW, xOf } from "../chart/ChartFrame";
import { EVENT_TYPES } from "../types";
import type { EventMarker } from "../types";

const ev = (
  type: EventMarker["type"],
  beat_idx: number,
  bin: number,
  probability: number,
  strength: EventMarker["strength"] = "strong",
): EventMarker => ({ type, beat_idx, bin, probability, strength });

// Three strong events crowd one bead (two of them reveals), one stands alone, and a faint one is not drawn.
const events = [
  ev("death", 3, 20.5, 0.7),
  ev("reveal", 2, 20, 0.91),
  ev("reveal", 4, 21, 0.6),
  ev("betrayal", 9, 80, 0.8),
  ev("injury_violence", 6, 50, 0.45, "faint"),
];
const structure = () => {
  const s = fakeStructure(12);
  s.chapters[0].title = "chapter V";
  return s;
};
function ribbon(props: Partial<Parameters<typeof EventRibbon>[0]> = {}) {
  const onHover = vi.fn();
  const onPin = vi.fn();
  const r = render(
    <EventRibbon
      events={events}
      structure={structure()}
      shown={null}
      onHover={onHover}
      onPin={onPin}
      {...props}
    />,
  );
  return { ...r, onHover, onPin, group: screen.getByRole("listbox", { name: /^Story events/ }) };
}

test("one plain bead per cluster, crowded or not, no numerals and no faint events", () => {
  const { container } = ribbon();
  const beads = screen.getAllByRole("option");
  expect(beads).toHaveLength(2);
  expect(container.querySelectorAll("circle[data-disc]")).toHaveLength(2);
  expect(container.querySelectorAll("circle")).toHaveLength(2);
  expect(container.querySelectorAll("g[data-bead] text")).toHaveLength(0);
  expect(container.querySelectorAll("rect[data-hit]")).toHaveLength(2);
  expect(container.textContent).not.toMatch(/injury/);
});

test("hovering a bead previews its top event's passage and clicking pins it", () => {
  const { container, onHover, onPin } = ribbon();
  const hits = container.querySelectorAll("rect[data-hit]");
  fireEvent.mouseEnter(hits[0]);
  expect(onHover).toHaveBeenCalledWith(2);
  fireEvent.mouseLeave(hits[0]);
  expect(onHover).toHaveBeenCalledWith(null);
  fireEvent.click(hits[1]);
  expect(onPin).toHaveBeenCalledWith(9);
});

test("a bead activated as an option, as a screen reader does, pins its passage", () => {
  const { onPin } = ribbon();
  fireEvent.click(screen.getAllByRole("option")[1]);
  expect(onPin).toHaveBeenCalledWith(9);
});

test("the active bead is drawn last, so a grown bead is never under its neighbor", () => {
  const { group } = ribbon({ shown: 2 });
  const beads = screen.getAllByRole("option");
  expect(beads.at(-1)).toHaveAttribute("id", group.getAttribute("aria-activedescendant"));
  expect(beads.at(-1)).toHaveAttribute("aria-label", expect.stringMatching(/^reveal/));
});

test("the ribbon is a horizontal listbox whose active bead is selected and whose pinned bead says so", () => {
  const { group } = ribbon({ shown: 2, pinned: 9 });
  expect(group).toHaveAttribute("aria-orientation", "horizontal");
  // The active bead is drawn last, so each bead states its place in the row.
  const place = (n: number) =>
    screen.getAllByRole("option").find((o) => o.getAttribute("aria-posinset") === String(n))!;
  expect(place(1)).toHaveAttribute("aria-setsize", "2");
  expect(place(1)).toHaveAttribute("aria-selected", "true");
  expect(place(1)).toHaveAttribute("aria-label", "reveal and death, chapter V, passage 3");
  expect(place(2)).toHaveAttribute("aria-selected", "false");
  expect(place(2)).toHaveAttribute(
    "aria-label",
    expect.stringMatching(/^betrayal, .*passage 10, pinned$/),
  );
});

test("the spoken label lists three or more events as a, b and c", () => {
  const trio = [ev("reveal", 2, 20, 0.9), ev("death", 2, 20, 0.8), ev("betrayal", 2, 20, 0.7)];
  ribbon({ events: trio });
  expect(screen.getByRole("option")).toHaveAttribute(
    "aria-label",
    "reveal, death and betrayal, chapter V, passage 3",
  );
});

test("the shown passage's bead is active and annotated with its events by probability and its chapter", () => {
  const { container, group } = ribbon({ shown: 2 });
  const annotation = container.querySelector("[data-event-note]")!;
  expect(annotation.textContent).toBe("reveal · death — chapter V");
  const bead = document.getElementById(group.getAttribute("aria-activedescendant")!)!;
  expect(bead).toHaveAttribute("aria-label", "reveal and death, chapter V, passage 3");
  expect(bead.querySelector("circle[data-disc]")).toHaveAttribute("stroke", "var(--mark)");
});

test("on a narrow chart a crowded bead's annotation keeps its likeliest names and counts the rest", () => {
  const crowd = EVENT_TYPES.slice(0, 7).map((t, i) => ev(t, 2, 20 + i / 10, 0.9 - i / 20));
  const { container } = ribbon({ events: crowd, shown: 2, width: 358 });
  const note = container.querySelector("[data-event-note]")!;
  expect(note.textContent).toMatch(/^reveal · death.* \+\d — chapter V$/);
  expect(wordsW(note.textContent!)).toBeLessThanOrEqual(358 - 24);
  const x = Number(note.getAttribute("x"));
  expect(x - wordsW(note.textContent!) / 2).toBeGreaterThanOrEqual(12);
});

test("the annotation names the chapter briefly and always fits; the spoken label keeps the full title", () => {
  const long = "The Interminable Account of How Everybody Arrived at the Castle in the Rain Again";
  expect(long).toHaveLength(81);
  const short = (title: string, width = 900) => {
    const s = structure();
    s.chapters[0].title = title;
    const crowd = EVENT_TYPES.slice(0, 7).map((t, i) => ev(t, 2, 20 + i / 10, 0.9 - i / 20));
    const { container, unmount } = render(
      <EventRibbon
        events={crowd}
        structure={s}
        shown={2}
        onHover={() => {}}
        onPin={() => {}}
        width={width}
      />,
    );
    const text = container.querySelector("[data-event-note]")!.textContent!;
    const label = screen.getAllByRole("option")[0].getAttribute("aria-label");
    unmount();
    return { text, label, chapter: text.split(" — ")[1] };
  };
  expect(short("Prologue. In which we begin").chapter).toBe("Prologue");
  const narrow = short(long, 358);
  expect(narrow.text).toMatch(/^reveal\b/);
  expect(narrow.text).toMatch(/…$/);
  expect(wordsW(narrow.text)).toBeLessThanOrEqual(358 - 24);
  expect(short(long).chapter).toBe("The Interminable Accoun…");
  const tiny = short(long, 200);
  expect(tiny.text).toMatch(/^reveal \+6 — The /);
  expect(wordsW(tiny.text)).toBeLessThanOrEqual(200 - 24);
  expect(narrow.label).toContain(long);
});

test("no annotation while nothing on the ribbon is shown", () => {
  const { container, group } = ribbon({ shown: 5 });
  expect(container.querySelector("[data-event-note]")).toBeNull();
  expect(group).not.toHaveAttribute("aria-activedescendant");
});

test("the ribbon is one tab stop whose arrow keys walk the beads, Enter pins and Escape leaves", () => {
  const { group, onPin, onHover, container } = ribbon();
  expect(group).toHaveAttribute("tabindex", "0");
  expect(screen.getAllByRole("option").every((b) => !b.hasAttribute("tabindex"))).toBe(true);
  const active = () => document.getElementById(group.getAttribute("aria-activedescendant") ?? "");
  // The bead's label is what a screen reader hears, so the ribbon keeps no live region to say it twice.
  expect(container.querySelector("[aria-live]")).toBeNull();
  fireEvent.keyDown(group, { key: "ArrowRight" });
  expect(active()).toHaveAttribute("aria-label", "reveal and death, chapter V, passage 3");
  expect(onHover).toHaveBeenLastCalledWith(2);
  fireEvent.keyDown(group, { key: "ArrowRight" });
  expect(active()).toHaveAttribute("aria-label", expect.stringMatching(/^betrayal, .*passage 10$/));
  fireEvent.keyDown(group, { key: "Enter" });
  expect(onPin).toHaveBeenLastCalledWith(9);
  fireEvent.keyDown(group, { key: "Home" });
  fireEvent.keyDown(group, { key: " " });
  expect(onPin).toHaveBeenLastCalledWith(2);
  fireEvent.keyDown(group, { key: "End" });
  expect(active()).toHaveAttribute("aria-label", expect.stringMatching(/^betrayal/));
  fireEvent.keyDown(group, { key: "Escape" });
  expect(group).not.toHaveAttribute("aria-activedescendant");
});

test("the ribbon's keys stay with the ribbon, so the chart around it does not step too", () => {
  const outer = vi.fn();
  render(
    <div onKeyDown={outer}>
      <EventRibbon
        events={events}
        structure={structure()}
        shown={null}
        onHover={() => {}}
        onPin={() => {}}
      />
    </div>,
  );
  const group = screen.getByRole("listbox", { name: /^Story events/ });
  for (const key of ["ArrowRight", "ArrowLeft", "Home", "End", "Enter"])
    fireEvent.keyDown(group, { key });
  expect(outer).not.toHaveBeenCalled();
});

function hoverAt(group: Element, x: number, pointerType = "mouse") {
  group.getBoundingClientRect = () => ({ left: 0, width: 900 }) as DOMRect;
  fireEvent.pointerMove(group, { clientX: x, pointerType });
}
// Frames run only when the test flushes them, so each step of the dock can be read.
let frames: FrameRequestCallback[] = [];
function stubFrames() {
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal("cancelAnimationFrame", () => (frames = []));
}
function flush(n = 1) {
  for (let k = 0; k < n; k++) frames.splice(0).forEach((cb) => cb(0));
}
const scales = (c: HTMLElement) =>
  [...c.querySelectorAll<SVGGElement>("g[data-bead]")].map((g) => g.style.transform);
const five = [10, 30, 50, 70, 90].map((bin, i) => ev("reveal", i, bin, 0.8));

test("only the bead under the mouse grows, its neighbors lean aside, and the dock comes to rest", () => {
  stubFrames();
  const { container, group } = ribbon({ events: five });
  hoverAt(group, xOf(50) + 5);
  expect(frames).toHaveLength(1);
  flush();
  const [a, b, c, d, e] = scales(container);
  expect([a, e]).toEqual(["", ""]);
  expect(c).toMatch(/^translate\(0px,0\) scale\(1\.17\d*\)$/);
  expect(b).toMatch(/^translate\(-1\.0\d*px,0\) scale\(1\.02\d*\)$/);
  expect(d).toMatch(/^translate\(1\.0\d*px,0\) scale\(1\.02\d*\)$/);
  // Moving within the same bead aims nowhere new, so no frame is asked for.
  hoverAt(group, xOf(50) - 5);
  expect(frames).toHaveLength(1);
  flush(40);
  expect(frames).toHaveLength(0);
  expect(scales(container)).toEqual([
    "",
    "translate(-3px,0) scale(1.08)",
    "translate(0px,0) scale(1.5)",
    "translate(3px,0) scale(1.08)",
    "",
  ]);
  fireEvent.pointerLeave(group, { pointerType: "mouse" });
  flush();
  expect(scales(container)[2]).toMatch(/scale\(1\.3/);
  flush(40);
  expect(frames).toHaveLength(0);
  expect(scales(container)).toEqual(["", "", "", "", ""]);
});

test("between two beads only the nearer one grows, and far from every bead none does", () => {
  stubFrames();
  const { container, group } = ribbon();
  hoverAt(group, xOf(80) - 30);
  flush(40);
  expect(scales(container)).toEqual([
    "translate(-3px,0) scale(1.08)",
    "translate(0px,0) scale(1.5)",
  ]);
  hoverAt(group, xOf(50));
  flush(40);
  expect(scales(container)).toEqual(["", ""]);
  hoverAt(group, xOf(20), "touch");
  expect(frames).toHaveLength(0);
  expect(scales(container)).toEqual(["", ""]);
});

test("under reduced motion nothing grows", () => {
  stubReducedMotion();
  stubFrames();
  const { container, group } = ribbon();
  hoverAt(group, xOf(20));
  flush(40);
  expect(frames).toHaveLength(0);
  expect(scales(container)).toEqual(["", ""]);
});

test("unmounting mid-motion stops the frames", () => {
  stubFrames();
  const { group, unmount } = ribbon();
  hoverAt(group, xOf(20));
  expect(frames).toHaveLength(1);
  unmount();
  expect(frames).toHaveLength(0);
});

test("a new aim while a frame is pending asks for no second frame", () => {
  stubFrames();
  const { group } = ribbon({ events: five });
  hoverAt(group, xOf(10));
  hoverAt(group, xOf(50));
  hoverAt(group, xOf(90));
  expect(frames).toHaveLength(1);
});

test("a new bead list mid-hover puts every bead back at rest and the dock starts afresh", () => {
  stubFrames();
  const { container, group, rerender } = ribbon({ events: five });
  hoverAt(group, xOf(50));
  flush(3);
  expect(scales(container)[2]).toMatch(/scale\(1\.\d/);
  const props = { structure: structure(), shown: null, onHover: () => {}, onPin: () => {} };
  rerender(<EventRibbon events={five.slice(0, 3)} {...props} />);
  expect(frames).toHaveLength(0);
  expect(scales(container)).toEqual(["", "", ""]);
  // The bead under the mouse before the change is no longer taken as the one already aimed at.
  hoverAt(group, xOf(50));
  expect(frames).toHaveLength(1);
  flush(40);
  expect(scales(container)).toEqual([
    "",
    "translate(-3px,0) scale(1.08)",
    "translate(0px,0) scale(1.5)",
  ]);
});

test("the ribbon follows the chart's width and each bead's target meets its neighbors halfway, at most 48 units out", () => {
  const bins = [10, 17, 24, 40, 90];
  const { container } = ribbon({
    events: bins.map((bin, i) => ev("reveal", i, bin, 0.8)),
    width: 450,
  });
  expect(container.querySelector("svg")).toHaveAttribute("viewBox", "0 0 450 54");
  const xs = bins.map((b) => xOf(b, 450));
  const spans = [...container.querySelectorAll("rect[data-hit]")].map((h) => [
    Number(h.getAttribute("x")),
    Number(h.getAttribute("x")) + Number(h.getAttribute("width")),
  ]);
  expect(spans).toHaveLength(5);
  for (let i = 1; i < spans.length; i++)
    expect(spans[i][0]).toBeGreaterThanOrEqual(spans[i - 1][1] - 1e-9);
  expect(spans[1][0]).toBeCloseTo((xs[0] + xs[1]) / 2, 6);
  expect(spans[2][0]).toBeCloseTo(spans[1][1], 9);
  expect(spans[4][1] - spans[4][0]).toBeCloseTo(96, 9);
  for (const h of container.querySelectorAll("rect[data-hit]"))
    expect(h).toHaveAttribute("height", "54");
});

test("the targets of beads at the very ends stop at the ribbon's edges", () => {
  const { container } = ribbon({ events: [ev("reveal", 0, 0, 0.8), ev("death", 11, 99, 0.8)] });
  const [first, last] = container.querySelectorAll("rect[data-hit]");
  expect(first).toHaveAttribute("x", "0");
  expect(Number(last.getAttribute("x")) + Number(last.getAttribute("width"))).toBeCloseTo(900, 9);
});

test("the legend is a closed disclosure that opens onto all nine marks", () => {
  const { container } = render(<EventLegend />);
  const toggle = screen.getByRole("button", { name: "What the marks mean" });
  // It sits tight under the ribbon and still reaches 40 px: 24 of its own and 8 either way from its ::after.
  expect(toggle).toHaveClass("min-h-[24px]", "after:-inset-y-[8px]");
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(container.querySelectorAll("svg")).toHaveLength(0);
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(container.querySelectorAll("svg")).toHaveLength(9);
  expect(container.textContent).toMatch(
    /only confident events are marked; the passage lists the faint ones/,
  );
});
