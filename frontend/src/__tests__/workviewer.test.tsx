import { render, screen, fireEvent, act, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WorkViewer from "../components/WorkViewer";
import { version } from "../../public/questions.json";
import type { Analysis } from "../types";
import { PLOT, yOf } from "../chart/ChartFrame";
import {
  DataRouter,
  fakeAnalysis,
  fakeStructure,
  popoverOf,
  stubPathLength,
  stubReducedMotion,
  stubResize,
} from "./fixtures";

// jsdom has neither scrolling nor path lengths; the chapter table scrolls and the opening measures its stroke. Most tests open a work already seen.
const scroll = Element.prototype.scrollIntoView;
beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
});
afterAll(() => {
  Element.prototype.scrollIntoView = scroll;
});
beforeEach(() => {
  stubPathLength();
  localStorage.setItem("sos.seen.test", "1");
});

const text = Array.from({ length: 12 }, (_, i) =>
  Array.from({ length: 800 }, () => `w${i}`).join(" "),
).join("\n\n");
function mount(extra = {}) {
  return render(
    <WorkViewer
      title="T"
      author="A"
      meta="12 passages"
      analysis={fakeAnalysis()}
      structure={fakeStructure(12)}
      text={text}
      seenKey="sos.seen.test"
      questionSet={version}
      {...extra}
    />,
    { wrapper: DataRouter },
  );
}

test("hover never opens the drawer but shows the tooltip; click pins and it stays; escape closes", async () => {
  const { container } = mount();
  const overlay = container.querySelector("[data-overlay]")!;
  overlay.getBoundingClientRect = () =>
    ({
      left: 0,
      width: 900,
      top: 0,
      height: 320,
      right: 900,
      bottom: 320,
      x: 0,
      y: 0,
      toJSON() {},
    }) as DOMRect;
  fireEvent.mouseMove(overlay, { clientX: 450 });
  expect(screen.queryByRole("region", { name: "Passage" })).toBeNull();
  expect(screen.getByRole("tooltip")).toHaveTextContent(/^Passage 7 · 2Fortune2\.0$/);
  fireEvent.click(overlay, { clientX: 450 });
  expect(screen.getByRole("region", { name: "Passage" })).toBeInTheDocument();
  expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.mouseLeave(overlay);
  expect(screen.getByRole("region", { name: "Passage" })).toBeInTheDocument();
  fireEvent.keyDown(container.querySelector("[tabindex='0']")!, { key: "Escape" });
  expect(screen.queryByRole("region", { name: "Passage" })).toBeNull();
});

test("a click on another passage while one is pinned opens it at once; a click on the pinned one closes", () => {
  const { container } = mount();
  const overlay = container.querySelector("[data-overlay]")!;
  overlay.getBoundingClientRect = () =>
    ({ left: 0, width: 900, top: 0, height: 320, right: 900, bottom: 320 }) as DOMRect;
  const heading = () =>
    within(screen.getByRole("region", { name: "Passage" })).getByText(/^Passage \d+ of 12/)
      .textContent;
  fireEvent.mouseMove(overlay, { clientX: 100 });
  fireEvent.click(overlay, { clientX: 100 });
  const first = heading();
  fireEvent.mouseMove(overlay, { clientX: 106 });
  fireEvent.mouseMove(overlay, { clientX: 700 });
  fireEvent.click(overlay, { clientX: 700 });
  expect(heading()).not.toBe(first);
  expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.click(overlay, { clientX: 700 });
  expect(screen.queryByRole("region", { name: "Passage" })).toBeNull();
});

test("while a passage is pinned the pointer still shows the passage under it, and the drawer stays put", () => {
  const { container } = mount();
  const overlay = container.querySelector("[data-overlay]")!;
  overlay.getBoundingClientRect = () => ({ left: 0, width: 900, top: 0, height: 320 }) as DOMRect;
  const heading = () =>
    within(screen.getByRole("region", { name: "Passage" })).getByText(/^Passage \d+ of 12/)
      .textContent;
  fireEvent.mouseMove(overlay, { clientX: 100 });
  fireEvent.click(overlay, { clientX: 100 });
  const pinned = heading();
  fireEvent.mouseMove(overlay, { clientX: 700 });
  expect(screen.getByRole("tooltip")).toHaveTextContent(/^Passage 10 /);
  expect(heading()).toBe(pinned);
  expect(container.querySelector("[data-pinned]")).not.toBeNull();
  fireEvent.mouseLeave(overlay);
  expect(screen.queryByRole("tooltip")).toBeNull();
  expect(heading()).toBe(pinned);
});

test("a hovered line takes the axis words and the definition line, and leaving gives them back", () => {
  const analysis = fakeAnalysis();
  analysis.bins.fortune.shape = Array(100).fill(1);
  analysis.bins.tension.shape = Array(100).fill(3);
  const { container } = mount({ analysis });
  fireEvent.click(
    within(screen.getByRole("group", { name: "Telling layers" })).getByRole("button", {
      name: /^Tension$/,
    }),
  );
  const words = () => container.querySelector("[data-axis-words]")!.getAttribute("data-axis-words");
  expect(words()).toBe("tension");
  expect(screen.queryByText(/how well things are going/i)).toBeNull();
  const overlay = container.querySelector("[data-overlay]")!;
  const { width, height, l, r, t, b } = PLOT;
  overlay.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: width - l - r, height: height - t - b }) as DOMRect;
  fireEvent.mouseMove(overlay, { clientX: 400, clientY: yOf(1) - t + 4 });
  expect(words()).toBe("fortune");
  expect(screen.getByText(/how well things are going/i)).toBeInTheDocument();
  expect(container.querySelector("path[data-layer=tension]")!.parentElement).toHaveAttribute(
    "opacity",
    "0.55",
  );
  fireEvent.mouseLeave(overlay);
  expect(words()).toBe("tension");
  expect(container.querySelector("path[data-layer=tension]")!.parentElement).toHaveAttribute(
    "opacity",
    "1",
  );
});

test("the first pin of a visit says Escape releases it, and no later pin does", () => {
  localStorage.removeItem("sos.seen.pinhint");
  const first = mount();
  const pinAt = (c: HTMLElement, x: number) => {
    const overlay = c.querySelector("[data-overlay]")!;
    overlay.getBoundingClientRect = () => ({ left: 0, width: 900, top: 0, height: 320 }) as DOMRect;
    fireEvent.mouseMove(overlay, { clientX: x });
    fireEvent.click(overlay, { clientX: x });
    return c.querySelector("[data-annotation]")?.textContent;
  };
  expect(pinAt(first.container, 100)).toMatch(/· pinned · Esc releases$/);
  expect(localStorage.getItem("sos.seen.pinhint")).toBe("1");
  fireEvent.keyDown(screen.getByRole("group", { name: /arc chart/i }), { key: "Escape" });
  expect(first.container.querySelector("[data-annotation]")).toBeNull();
  expect(pinAt(first.container, 100)).toMatch(/· pinned$/);
  first.unmount();
  expect(pinAt(mount().container, 700)).toMatch(/· pinned$/);
});

test("definition line follows the hovered chip and the explainer toggles", async () => {
  const user = userEvent.setup();
  mount();
  fireEvent.pointerEnter(screen.getByRole("button", { name: /^Dread$/ }), { pointerType: "mouse" });
  expect(screen.getByText(/fear of what is coming/i)).toBeInTheDocument();
  fireEvent.pointerLeave(screen.getByRole("button", { name: /^Dread$/ }), { pointerType: "mouse" });
  expect(screen.getByText(/fear of what is coming/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /^Humor$/ }));
  expect(screen.getByText(/playing for a smile/i)).toBeInTheDocument();
  // Turned off again, the line goes back to a layer that is drawn.
  fireEvent.click(screen.getByRole("button", { name: /^Humor$/ }));
  expect(screen.getByText(/how well things are going/i)).toBeInTheDocument();
  expect(screen.queryByText(/playing for a smile/i)).toBeNull();
  await user.click(screen.getByRole("button", { name: /how to read this chart/i }));
  expect(screen.getByRole("region", { name: "How to read this chart" })).toBeInTheDocument();
});

const shaped = () => {
  const a = fakeAnalysis();
  a.archetype = { ...a.archetype, state: "named", shape: "fall_rise" };
  return a;
};
// The first frame starts the opening's clock and the next one lands past its end.
const drawAtOnce = () => {
  let now = 0;
  return vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    cb((now += 5000));
    return 1;
  });
};

test("the opening plays once per work and replay is offered", () => {
  localStorage.removeItem("sos.seen.test");
  drawAtOnce();
  mount({ analysis: shaped() });
  expect(localStorage.getItem("sos.seen.test")).toBe("1");
  // One in the shape card beside the title, one in the phone's shape line under the chart; only one of them is ever shown.
  expect(screen.getAllByRole("button", { name: /replay/i })).toHaveLength(2);
  for (const aside of screen.getAllByRole("complementary", { name: "Story shape" }))
    expect(within(aside).getByRole("button", { name: /replay/i })).toBeInTheDocument();
});

test("a work with no clear shape, or a shape this build cannot sketch, offers no replay", () => {
  const { unmount } = mount();
  expect(screen.queryByRole("button", { name: /replay/i })).toBeNull();
  unmount();
  const noneButShaped = shaped();
  noneButShaped.archetype.state = "none";
  const unknown = shaped();
  unknown.archetype.shape = "no_such_shape";
  for (const analysis of [noneButShaped, unknown]) {
    const r = mount({ analysis });
    expect(screen.queryByRole("button", { name: /replay/i })).toBeNull();
    r.unmount();
  }
});

test("a work already seen on this device opens without the draw-in", () => {
  const raf = drawAtOnce();
  mount({ analysis: shaped() });
  expect(raf).not.toHaveBeenCalled();
});

test("replay draws the line in again and the work stays seen", () => {
  const raf = drawAtOnce();
  const { container } = mount({ analysis: shaped() });
  const still = container.querySelector("path[data-layer=fortune]")!.getAttribute("d");
  fireEvent.click(screen.getAllByRole("button", { name: /replay/i })[1]);
  expect(raf).toHaveBeenCalled();
  expect(container.querySelector("path[data-layer=fortune]")!.getAttribute("d")).toBe(still);
  expect(localStorage.getItem("sos.seen.test")).toBe("1");
});

test("replay first brings the chart to the middle of the screen, and jumps there under reduced motion", async () => {
  drawAtOnce();
  const scrolled = vi.spyOn(Element.prototype, "scrollIntoView");
  const { container, unmount } = mount({ analysis: shaped() });
  fireEvent.click(screen.getAllByRole("button", { name: /replay/i })[1]);
  expect(scrolled).toHaveBeenCalledTimes(1);
  expect(scrolled.mock.contexts[0]).toBe(
    container.querySelector("[role=group][aria-label^='Arc chart']"),
  );
  expect(scrolled).toHaveBeenLastCalledWith({ block: "center", behavior: "smooth" });
  unmount();
  stubReducedMotion();
  mount({ analysis: shaped() });
  fireEvent.click(screen.getAllByRole("button", { name: /replay/i })[1]);
  expect(scrolled).toHaveBeenLastCalledWith({ block: "center", behavior: "auto" });
});

test("a passage first pinned from the chart brings the drawer's top row into view, once: a mouse keeps its spot on the plot, a tap or the keys go the whole way, and it jumps under reduced motion", () => {
  const scrolled = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
  // The plot spans 360–668 px of a 768 px window; the drawer's top row ends at rowBottom.
  let rowBottom = 900;
  const rect = (top: number, bottom: number) =>
    ({ left: 0, width: 900, right: 900, top, bottom, height: bottom - top }) as DOMRect;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    if (this.hasAttribute("data-overlay")) return rect(360, 668);
    if (this.firstElementChild?.matches(".label") && /^Passage/.test(this.textContent ?? ""))
      return rect(rowBottom - 44, rowBottom);
    return rect(0, 0);
  });
  const lastScroll = () => scrolled.mock.lastCall![0] as unknown as ScrollToOptions;
  const { container, unmount } = mount();
  const overlay = container.querySelector("[data-overlay]")!;
  // The row would rest 30% of the window above its foot, 362 px further down, but the mouse at 514 px keeps the page to 146 px.
  const mouseClick = (el: Element, clientX: number, clientY: number) => {
    fireEvent.pointerDown(el, { pointerType: "mouse", clientX, clientY });
    fireEvent.click(el, { clientX, clientY });
  };
  mouseClick(overlay, 450, 514);
  expect(scrolled).toHaveBeenCalledTimes(1);
  expect(scrolled).toHaveBeenLastCalledWith({ top: 146, behavior: "smooth" });
  // Stepping, or pinning another passage while one is open, leaves the page where the reader put it.
  fireEvent.click(screen.getByRole("button", { name: /later/i }));
  mouseClick(overlay, 100, 514);
  expect(scrolled).toHaveBeenCalledTimes(1);
  // A finger lifts after its tap, so a tap gets the whole way.
  fireEvent.keyDown(screen.getByRole("group", { name: /arc chart/i }), { key: "Escape" });
  fireEvent.pointerDown(overlay, { pointerType: "touch", clientX: 450, clientY: 514 });
  fireEvent.click(overlay, { clientX: 450, clientY: 514 });
  expect(scrolled).toHaveBeenCalledTimes(2);
  expect(lastScroll().top).toBeCloseTo(900 - 768 * 0.7);
  unmount();
  // The keys move no hand, so a passage opened from the ribbon after a mouse click elsewhere gets the whole way too.
  stubReducedMotion();
  rowBottom = 600;
  const a = fakeAnalysis();
  a.events = [{ type: "reveal", beat_idx: 2, bin: 20, probability: 0.9, strength: "strong" }];
  const again = mount({ analysis: a }).container.querySelector("[data-overlay]")!;
  // A mouse click low on the plot leaves no room to move, so it opens its passage without a scroll.
  mouseClick(again, 450, 660);
  expect(scrolled).toHaveBeenCalledTimes(2);
  fireEvent.keyDown(screen.getByRole("group", { name: /arc chart/i }), { key: "Escape" });
  const ribbon = screen.getByRole("listbox", { name: /^Story events/ });
  fireEvent.keyDown(ribbon, { key: "ArrowRight" });
  fireEvent.keyDown(ribbon, { key: "Enter" });
  expect(screen.getByRole("region", { name: "Passage" })).toHaveTextContent(/Passage 3 of 12/);
  expect(scrolled).toHaveBeenCalledTimes(3);
  expect(lastScroll().top).toBeCloseTo(600 - 768 * 0.7);
  expect(lastScroll().behavior).toBe("auto");
});

test("stepping past the last passage keeps it pinned", () => {
  const { container } = mount();
  const chart = screen.getByRole("group", { name: /arc chart/i });
  fireEvent.keyDown(chart, { key: "End" });
  expect(container.querySelector("[data-summary]")?.textContent).toMatch(/^Passage 12 of 12/);
  fireEvent.click(screen.getByRole("button", { name: /later/i }));
  fireEvent.keyDown(chart, { key: "ArrowRight" });
  expect(container.querySelector("[data-summary]")?.textContent).toMatch(/^Passage 12 of 12/);
  expect(screen.getByRole("region", { name: "Passage" })).toBeInTheDocument();
});

test("the ribbon's keys are heard through its bead alone, and hovering the chart still reads out the passage", () => {
  const a = fakeAnalysis();
  a.events = [{ type: "reveal", beat_idx: 2, bin: 20, probability: 0.9, strength: "strong" }];
  const { container } = mount({ analysis: a });
  const summary = container.querySelector("[data-summary]")!;
  expect(summary).toHaveAttribute("aria-live", "polite");
  const ribbon = screen.getByRole("listbox", { name: /^Story events/ });
  act(() => ribbon.focus());
  fireEvent.keyDown(ribbon, { key: "ArrowRight" });
  expect(ribbon).toHaveAttribute("aria-activedescendant", expect.stringMatching(/.+/));
  expect(summary).toHaveTextContent(/^Passage 3 of 12/);
  expect(summary).toHaveAttribute("aria-live", "off");
  act(() => ribbon.blur());
  expect(summary).toHaveAttribute("aria-live", "polite");
  // A click on a bead pins it but leaves the summary speaking, since only the keys walk the ribbon.
  act(() => ribbon.focus());
  expect(summary).toHaveAttribute("aria-live", "polite");
  fireEvent.click(screen.getAllByRole("option")[0]);
  expect(summary).toHaveTextContent(/^Passage 3 of 12.* · pinned$/);
  expect(summary).toHaveAttribute("aria-live", "polite");
  fireEvent.keyDown(ribbon, { key: "Escape" });
  act(() => ribbon.blur());
  const overlay = container.querySelector("[data-overlay]")!;
  overlay.getBoundingClientRect = () =>
    ({ left: 0, width: 900, top: 0, height: 320, right: 900, bottom: 320 }) as DOMRect;
  fireEvent.mouseMove(overlay, { clientX: 450 });
  expect(summary).toHaveTextContent(/^Passage 7 of 12/);
  expect(summary).toHaveAttribute("aria-live", "polite");
});

test("a shared work opens its passages without the text", () => {
  mount({ text: "", shared: true });
  fireEvent.click(screen.getAllByRole("row")[1]);
  expect(screen.getByText(/lives only on the device/i)).toBeInTheDocument();
});

const structure = fakeStructure(4, 2);
const viewer = (analysis: Analysis, body = "") => (
  <WorkViewer
    title="T"
    author="A"
    meta="4 passages"
    analysis={analysis}
    structure={structure}
    text={body}
    seenKey="sos.seen.test"
    questionSet={version}
  />
);

test("WorkViewer: ArrowRight on the arc chart container selects passage 1 and the live region updates", () => {
  const { container: root } = render(viewer(fakeAnalysis()), { wrapper: DataRouter });
  const container = screen.getByLabelText(/arrow keys to move between passages/i);
  fireEvent.keyDown(container, { key: "ArrowRight" });
  expect(root.querySelector("[data-summary]")?.textContent).toMatch(/Passage 1 of 4 · Chapter 1/);
});

test("WorkViewer opens at the shape curve and the slider redraws the line from the detail curve", async () => {
  const a = fakeAnalysis();
  a.bins.fortune.detail = Array.from({ length: 100 }, (_, i) => 2 + Math.sin(i / 5));
  const { container } = render(viewer(a), { wrapper: DataRouter });
  const line = () => container.querySelector("path[data-layer=fortune]")!.getAttribute("d");
  const slider = screen.getByRole("slider", { name: "Smoothing, from detail to shape" });
  expect(slider).toHaveValue("1");
  const shape = line();
  fireEvent.change(slider, { target: { value: "0" } });
  await waitFor(() => expect(line()).not.toBe(shape));
  expect(screen.queryByRole("button", { name: "table" })).toBeNull();
});

test("WorkViewer highlights the driver chunk only at or above the analysis driver gate", () => {
  const body = "First para.\n\nSecond one.\n\nThird here.";
  const withDriver = (
    confidence: number,
    driver_gate: number,
    paragraph_end_idx: number,
  ): Analysis => ({
    ...fakeAnalysis(),
    drivers: { fortune: { "0": { paragraph_idx: 1, paragraph_end_idx, confidence } } },
    driver_gate,
  });
  const lit = () =>
    Array.from(document.querySelectorAll("[data-driver]")).map((el) => el.lastChild?.textContent);
  const { rerender } = render(viewer(withDriver(0.6, 0.7, 1), body), { wrapper: DataRouter });
  fireEvent.keyDown(screen.getByLabelText(/arrow keys to move between passages/i), {
    key: "ArrowRight",
  });
  expect(lit()).toEqual([]);
  rerender(viewer(withDriver(0.7, 0.7, 1), body));
  expect(lit()).toEqual(["Second one."]);
  rerender(viewer(withDriver(0.7, 0.7, 2), body));
  expect(lit()).toEqual(["Second one.", "Third here."]);
});

test("WorkViewer marks the pinned passage for every drawn layer with a span at or above the gate", () => {
  const body = "First para.\n\nSecond one.\n\nThird here.";
  const span = (paragraph_idx: number, paragraph_end_idx: number) => ({
    "0": { paragraph_idx, paragraph_end_idx, confidence: 0.8 },
  });
  const analysis: Analysis = {
    ...fakeAnalysis(),
    drivers: { fortune: span(0, 1), tension: span(1, 2) },
    driver_gate: 0.7,
  };
  render(viewer(analysis, body), { wrapper: DataRouter });
  fireEvent.click(
    within(screen.getByRole("group", { name: "Telling layers" })).getByRole("button", {
      name: "Tension",
    }),
  );
  fireEvent.keyDown(screen.getByLabelText(/arrow keys to move between passages/i), {
    key: "ArrowRight",
  });
  const marks = Array.from(document.querySelectorAll("[data-driver]")).map((el) => [
    el.lastChild?.textContent,
    el.getAttribute("data-driver"),
  ]);
  expect(marks).toEqual([
    ["First para.", "fortune"],
    ["Second one.", "fortune tension"],
    ["Third here.", "tension"],
  ]);
  expect(
    screen.getByText("underlined: what moved the Fortune line · rule: Tension"),
  ).toBeInTheDocument();
});

test("closing the drawer, by its button or by Escape inside it, returns focus to the chart", async () => {
  const user = userEvent.setup();
  mount();
  const chart = screen.getByRole("group", { name: /arc chart/i });
  fireEvent.keyDown(chart, { key: "Home" });
  await user.click(screen.getByRole("button", { name: /close/i }));
  expect(screen.queryByRole("region", { name: "Passage" })).toBeNull();
  expect(document.activeElement).toBe(chart);
  fireEvent.keyDown(chart, { key: "Home" });
  await user.click(screen.getByRole("button", { name: /later/i }));
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("region", { name: "Passage" })).toBeNull();
  expect(document.activeElement).toBe(chart);
});

test("Escape in a popover inside the drawer closes the popover and leaves the drawer open", async () => {
  const user = userEvent.setup();
  mount();
  fireEvent.keyDown(screen.getByRole("group", { name: /arc chart/i }), { key: "Home" });
  act(() => screen.getByRole("button", { name: "What Writing means" }).focus());
  expect(popoverOf("What Writing means")).toHaveTextContent(/^Writing/);
  await user.keyboard("{Escape}");
  expect(popoverOf("What Writing means")).toBeNull();
  expect(screen.getByRole("region", { name: "Passage" })).toBeInTheDocument();
});

test("the chart is drawn at the width its box is given, follows it when the screen turns, and stops watching when it goes", () => {
  const box = stubResize();
  const { unmount } = mount();
  const chart = screen.getByRole("img", { name: "Story arcs by percent of work" }),
    ribbon = screen.getByRole("listbox", { name: /^Story events/ });
  expect(chart).toHaveAttribute("viewBox", "0 0 900 320");
  expect(box.watching).toBe(1);
  box.resize(358);
  expect(chart).toHaveAttribute("viewBox", "0 0 358 212");
  expect(ribbon.getAttribute("viewBox")).toMatch(/^0 0 358 /);
  box.resize(736);
  expect(chart).toHaveAttribute("viewBox", "0 0 736 287");
  expect(ribbon.getAttribute("viewBox")).toMatch(/^0 0 736 /);
  // Narrower than any phone the drawing stops shrinking, and it never grows past a wide desktop.
  box.resize(200);
  expect(chart).toHaveAttribute("viewBox", "0 0 280 196");
  box.resize(3000);
  expect(chart).toHaveAttribute("viewBox", "0 0 1200 380");
  unmount();
  expect(box.watching).toBe(0);
});

test.each([
  [
    "an earlier set",
    "q0",
    "Scored with an earlier set of questions (q0); uploading the text again scores it with the current set.",
  ],
  [
    "no set, as in a copy saved before results carried one",
    undefined,
    "Scored with an earlier set of questions; uploading the text again scores it with the current set.",
  ],
])("a result scored under %s says so in one quiet line", (_, questionSet, line) => {
  mount({ questionSet });
  expect(screen.getByText(line)).toBeInTheDocument();
});

test("a result scored under the current question set has no such line", () => {
  mount();
  expect(screen.queryByText(/earlier set of questions/)).toBeNull();
});

test.each([
  [
    [3],
    "1 passage could not be scored. It adds nothing to the curves, which are drawn from the scored passages alone; any stretch of the text left with no score is hatched on the chart.",
  ],
  [
    [3, 7],
    "2 passages could not be scored. They add nothing to the curves, which are drawn from the scored passages alone; any stretch of the text left with no score is hatched on the chart.",
  ],
])("a result with unscored passages %j says how many in one quiet line", (missing, line) => {
  mount({ analysis: { ...fakeAnalysis(), missing_beats: missing } });
  expect(screen.getByText(line)).toBeInTheDocument();
});

test("a result with every passage scored has no such line", () => {
  mount();
  expect(screen.queryByText(/could not be scored/)).toBeNull();
});

test("the reading sentence sits under the meta line and describes the chart", () => {
  const { container } = mount({ analysis: shaped() });
  const sentence = screen.getByText("A man in a hole.", { selector: "p" });
  const meta = screen.getByText("A · 12 passages");
  expect(meta.compareDocumentPosition(sentence)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  const svg = screen.getByRole("img", { name: "Story arcs by percent of work" });
  expect(svg).toHaveAttribute("aria-describedby", sentence.id);
  expect(sentence.id).not.toBe("");
  expect(container.querySelector("svg > desc")).toHaveTextContent("A man in a hole.");
});

test("the compare link stands in the meta line, and only when there is somewhere to compare", () => {
  const { unmount } = mount();
  expect(screen.queryByRole("link", { name: /compare with another work/i })).toBeNull();
  unmount();
  mount({ compareTo: "/compare?a=gallery:x" });
  const compare = screen.getByRole("link", { name: "Compare with another work" });
  expect(compare).toHaveAttribute("href", "/compare?a=gallery:x");
  expect(compare.parentElement).toHaveTextContent(/^A · 12 passages/);
});

test("from 1280 px the shape stands unboxed in the header's right column, and the explainer spans the page", async () => {
  const user = userEvent.setup();
  mount({ analysis: shaped() });
  const card = screen
    .getAllByRole("complementary", { name: "Story shape" })
    .find((a) => within(a).queryByRole("heading"))!;
  const column = card.parentElement!;
  // The column stands beside the title, the chips and the definition line alike.
  const headerRow = column.parentElement!;
  expect(headerRow).toContainElement(screen.getByRole("heading", { level: 1 }));
  expect(headerRow).toContainElement(screen.getByRole("group", { name: "Telling layers" }));
  expect(headerRow).toContainElement(screen.getByRole("button", { name: /how to read/i }));
  await user.click(screen.getByRole("button", { name: /how to read this chart/i }));
  const explainer = screen.getByRole("region", { name: "How to read this chart" });
  expect(headerRow).not.toContainElement(explainer);
  const chartBlock = screen.getByRole("group", { name: /arc chart/i }).parentElement!;
  expect(chartBlock.parentElement).toBe(headerRow.parentElement);
  expect(chartBlock.parentElement).toContainElement(explainer);
  expect(chartBlock).not.toContainElement(explainer);
});

test("in this room links the family's neighbors, and is absent without them", () => {
  const { unmount } = mount();
  expect(screen.queryByRole("navigation", { name: "In this room" })).toBeNull();
  unmount();
  mount({ room: { prev: { slug: "p", title: "Before" }, next: { slug: "n", title: "After" } } });
  const room = screen.getByRole("navigation", { name: "In this room" });
  expect(within(room).getByRole("link", { name: /Before/ })).toHaveAttribute("href", "/gallery/p");
  expect(within(room).getByRole("link", { name: /After/ })).toHaveAttribute("href", "/gallery/n");
  expect(room.compareDocumentPosition(screen.getByRole("table"))).toBe(
    Node.DOCUMENT_POSITION_PRECEDING,
  );
});
