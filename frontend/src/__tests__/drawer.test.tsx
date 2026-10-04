import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PassageDrawer from "../components/PassageDrawer";
import {
  advance,
  fakeAnalysis,
  fakeAnswers,
  fakeStructure,
  stubAnimate,
  stubReducedMotion,
  stubSpeech,
} from "./fixtures";
import { AXES, type Analysis, type EventMarker, type ScoredAnswers } from "../types";

const text = Array.from({ length: 12 }, (_, i) =>
  Array.from({ length: 800 }, () => `w${i}`).join(" "),
).join("\n\n");

test("shows scores, writing, the underlined driver, and steps", async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  const onClose = vi.fn();
  const s = fakeStructure(12);
  render(
    <PassageDrawer
      beat={3}
      structure={s}
      analysis={fakeAnalysis()}
      answers={fakeAnswers()}
      text={text}
      axes={["fortune", "tension"]}
      drivers={{ fortune: [0, 0] }}
      onClose={onClose}
      onSelect={onSelect}
    />,
  );
  expect(screen.getByText(/Passage 4 of 12/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "What the range means" })).toBeInTheDocument();
  expect(screen.getByText(/Writing/)).toBeInTheDocument();
  expect(screen.getByText(/underlined: what moved the Fortune line/)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /later/ }));
  expect(onSelect).toHaveBeenCalledWith(4);
  await user.click(screen.getByRole("button", { name: /close/i }));
  expect(onClose).toHaveBeenCalled();
});

test("without text it says where the text lives and still shows the curve values", () => {
  render(
    <PassageDrawer
      beat={0}
      structure={fakeStructure(12)}
      analysis={fakeAnalysis()}
      text=""
      axes={["fortune"]}
      drivers={{}}
      onClose={() => {}}
      onSelect={() => {}}
    />,
  );
  expect(screen.getByText(/lives only on the device/i)).toBeInTheDocument();
  expect(screen.getByText(/From the curve/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /earlier/ })).toHaveAttribute("aria-disabled", "true");
  expect(screen.queryByText(/underlined: what moved/)).not.toBeInTheDocument();
});

test("after the text was discarded it says so instead of pointing to another device", () => {
  render(
    <PassageDrawer
      beat={0}
      structure={fakeStructure(12)}
      analysis={fakeAnalysis()}
      text=""
      textDiscarded
      axes={["fortune"]}
      drivers={{}}
      onClose={() => {}}
      onSelect={() => {}}
    />,
  );
  expect(
    screen.getByText(
      /The text was not saved, so the passage cannot be shown\. Scores and chapter are shown instead\./,
    ),
  ).toBeInTheDocument();
  expect(screen.queryByText(/lives only on the device/i)).toBeNull();
});

test("the step buttons carry drawn chevrons, not arrow characters, and keep their names", () => {
  render(
    <PassageDrawer
      beat={3}
      structure={fakeStructure(12)}
      analysis={fakeAnalysis()}
      text=""
      axes={["fortune"]}
      drivers={{}}
      onClose={() => {}}
      onSelect={() => {}}
    />,
  );
  for (const name of ["earlier", "later"]) {
    const b = screen.getByRole("button", { name });
    expect(b.textContent).toBe(name);
    expect(b.querySelector("svg[aria-hidden]")).toBeTruthy();
  }
});

test("the driver range is underlined and the paragraphs around it are not", () => {
  const three = "Para zero.\n\nPara one.\n\nPara two.\n\nPara three.";
  render(
    <PassageDrawer
      beat={0}
      structure={fakeStructure(4, 1)}
      analysis={fakeAnalysis()}
      text={three}
      axes={["fortune"]}
      drivers={{ fortune: [1, 2] }}
      onClose={() => {}}
      onSelect={() => {}}
    />,
  );
  for (const t of ["Para one.", "Para two."]) {
    expect(screen.getByText(t)).toHaveAttribute("data-driver", "fortune");
    expect(screen.getByText(t)).toHaveClass("underline");
  }
  for (const t of ["Para zero.", "Para three."])
    expect(screen.getByText(t)).not.toHaveAttribute("data-driver");
});

test("a second drawn layer's span gets a rule in its color, both marks show and are named", () => {
  const three = "Para zero.\n\nPara one.\n\nPara two.";
  render(
    <PassageDrawer
      beat={0}
      structure={fakeStructure(4, 1)}
      analysis={fakeAnalysis()}
      text={three}
      axes={["fortune", "tension"]}
      drivers={{ fortune: [0, 1], tension: [1, 2] }}
      onClose={() => {}}
      onSelect={() => {}}
    />,
  );
  const [zero, one, two] = ["Para zero.", "Para one.", "Para two."].map((t) => screen.getByText(t));
  expect(zero).toHaveClass("underline");
  expect(zero.style.boxShadow).toBe("");
  expect(one).toHaveClass("underline");
  expect(one.style.boxShadow).toContain("var(--ax-tension)");
  expect(two).not.toHaveClass("underline");
  expect(two.style.boxShadow).toContain("var(--ax-tension)");
  expect(two).toHaveAttribute("data-driver", "tension");
  expect(one.querySelectorAll(".sr-only")).toHaveLength(2);
  expect(two.querySelector(".sr-only")).toHaveTextContent("what moved the Tension line");
  expect(
    screen.getByText("underlined: what moved the Fortune line · rule: Tension"),
  ).toBeInTheDocument();
});

test("only a rule when the first drawn layer has no span", () => {
  render(
    <PassageDrawer
      beat={0}
      structure={fakeStructure(4, 1)}
      analysis={fakeAnalysis()}
      text={"Para zero.\n\nPara one."}
      axes={["fortune", "tension"]}
      drivers={{ tension: [1, 1] }}
      onClose={() => {}}
      onSelect={() => {}}
    />,
  );
  expect(screen.getByText("rule: what moved the Tension line")).toBeInTheDocument();
  expect(screen.getByText("Para one.")).not.toHaveClass("underline");
});

test("two or more rules are named in the order they stand, left to right", () => {
  render(
    <PassageDrawer
      beat={0}
      structure={fakeStructure(4, 1)}
      analysis={fakeAnalysis()}
      text={"Para zero.\n\nPara one."}
      axes={["fortune", "tension", "mystery"]}
      drivers={{ fortune: [0, 0], tension: [1, 1], mystery: [0, 1] }}
      onClose={() => {}}
      onSelect={() => {}}
    />,
  );
  expect(
    screen.getByText(
      "underlined: what moved the Fortune line · rules, left to right: Tension, Mystery",
    ),
  ).toBeInTheDocument();
});

test("Stop stays while a passage is still being read, though the voice list has emptied", () => {
  const speech = stubSpeech();
  render(
    <PassageDrawer
      beat={0}
      structure={fakeStructure(4, 1)}
      analysis={fakeAnalysis()}
      text={"Para zero.\n\nPara one."}
      axes={["fortune"]}
      drivers={{}}
      onClose={() => {}}
      onSelect={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Read aloud" }));
  speech.synth.voices = [];
  act(() => speech.synth.fireVoicesChanged());
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  expect(speech.synth.cancel).toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Read aloud" })).toBeNull();
});

test("read aloud is offered only where a voice on the device can read", () => {
  const props = {
    beat: 0,
    structure: fakeStructure(4, 1),
    analysis: fakeAnalysis(),
    text: "Para zero.\n\nPara one.",
    axes: ["fortune" as const],
    drivers: {},
    onClose: () => {},
    onSelect: () => {},
  };
  vi.stubGlobal("speechSynthesis", undefined);
  const { unmount } = render(<PassageDrawer {...props} />);
  expect(screen.queryByRole("button", { name: "Read aloud" })).toBeNull();
  unmount();
  stubSpeech([{ name: "Network", lang: "en-US", localService: false, default: true }]);
  const second = render(<PassageDrawer {...props} />);
  expect(screen.queryByRole("button", { name: "Read aloud" })).toBeNull();
  second.unmount();
  const speech = stubSpeech();
  render(<PassageDrawer {...props} />);
  const read = screen.getByRole("button", { name: "Read aloud" });
  expect(read).not.toHaveAttribute("aria-pressed");
  expect(screen.queryByRole("button", { name: "Stop" })).toBeNull();
  fireEvent.click(read);
  expect(screen.getByText("Para zero.")).toHaveAttribute("data-reading", "true");
  // The box, not the page, scrolls to a paragraph below its view.
  const one = screen.getByText("Para one.");
  const box = one.parentElement!;
  Object.defineProperty(one, "offsetTop", { value: 500 });
  Object.defineProperty(one, "offsetHeight", { value: 100 });
  Object.defineProperty(box, "clientHeight", { value: 200 });
  act(() => speech.spoken[0].onend!());
  expect(one).toHaveAttribute("data-reading", "true");
  expect(box.scrollTop).toBe(500);
  fireEvent.click(screen.getByRole("button", { name: "Pause" }));
  expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  expect(screen.getByRole("button", { name: "Read aloud" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Stop" })).toBeNull();
});

test("the step buttons stay focusable at the ends and ask for the passage beside", async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  render(
    <PassageDrawer
      beat={11}
      structure={fakeStructure(12)}
      analysis={fakeAnalysis()}
      text=""
      axes={["fortune"]}
      drivers={{}}
      onClose={() => {}}
      onSelect={onSelect}
    />,
  );
  expect(screen.getByRole("button", { name: /later/ })).toHaveAttribute("aria-disabled", "true");
  await user.click(screen.getByRole("button", { name: /earlier/ }));
  expect(onSelect).toHaveBeenCalledWith(10);
});

test("the curve means ignore empty bins, and no spread or writing kind is claimed", () => {
  stubReducedMotion();
  const structure = fakeStructure(2, 1);
  const raw: (number | null)[] = Array.from({ length: 100 }, (_, i) => (i < 50 ? 2 : 5));
  // Counted as zeros, the five empty bins would pull the mean down to 1.8.
  for (let i = 5; i < 10; i++) raw[i] = null;
  const a = fakeAnalysis();
  const analysis: Analysis = {
    ...a,
    bins: Object.fromEntries(AXES.map((ax) => [ax, { ...a.bins[ax], raw }])) as Analysis["bins"],
  };
  render(
    <PassageDrawer
      beat={0}
      structure={structure}
      analysis={analysis}
      text=""
      axes={["fortune"]}
      drivers={{}}
      onClose={() => {}}
      onSelect={() => {}}
    />,
  );
  expect(screen.getAllByText("2.0").length).toBe(AXES.length);
  expect(document.querySelector("[data-range]")).toBeNull();
  expect(screen.queryByRole("button", { name: "What the range means" })).not.toBeInTheDocument();
});

test("a passage that could not be scored says so and falls back to the curve", () => {
  render(
    <PassageDrawer
      beat={0}
      structure={fakeStructure(12)}
      analysis={fakeAnalysis()}
      answers={{ missing: true, error: "text_too_short" }}
      text=""
      axes={["fortune"]}
      drivers={{}}
      onClose={() => {}}
      onSelect={() => {}}
    />,
  );
  expect(
    screen.getByText(
      "This passage could not be scored; the values are read from the curve around it.",
    ),
  ).toBeInTheDocument();
  expect(screen.getByText("From the curve")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "What the range means" })).not.toBeInTheDocument();
});

test("the passage's events show as chips with glyph and name, strong first, faint marked", () => {
  const analysis: Analysis = {
    ...fakeAnalysis(),
    events: [
      { type: "death", beat_idx: 3, bin: 30, probability: 0.3, strength: "faint" },
      { type: "reveal", beat_idx: 3, bin: 31, probability: 0.8, strength: "strong" },
      { type: "betrayal", beat_idx: 4, bin: 40, probability: 0.9, strength: "strong" },
    ],
  };
  const props = {
    structure: fakeStructure(12),
    analysis,
    text: "",
    axes: ["fortune" as const],
    drivers: {},
    onClose: () => {},
    onSelect: () => {},
  };
  withTimers(() => {
    const { rerender } = render(<PassageDrawer beat={3} {...props} />);
    const chips = screen.getAllByRole("listitem");
    expect(chips.map((c) => c.textContent)).toEqual(["reveal", "death (faint)"]);
    for (const c of chips) expect(c.querySelector("svg")).toBeTruthy();
    expect(chips[0]).not.toHaveClass("opacity-60");
    expect(chips[1]).toHaveClass("opacity-60");
    expect(within(chips[1]).getByText("(faint)")).toHaveClass("sr-only");
    rerender(<PassageDrawer beat={5} {...props} />);
    expect(screen.queryByRole("list", { name: "Events in this passage" })).toBeNull();
  });
});

// Each of the four passages is one run of its own letter, so the copies on screen can be told apart.
const lettered = ["a", "b", "c", "d"].map((c) => c.repeat(100)).join("");
const stepProps = {
  structure: fakeStructure(4, 1),
  analysis: fakeAnalysis(),
  text: lettered,
  axes: ["fortune" as const],
  drivers: {},
  onClose: () => {},
  onSelect: () => {},
};
const passages = () => screen.queryAllByText(/^(a+|b+|c+|d+)$/).map((p) => p.textContent![0]);
function withTimers(run: () => void) {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"],
  });
  run();
}
const textBox = () => screen.getByText(/^(a+|b+|c+|d+)$/).parentElement!;
const sweeps = (runs: ReturnType<typeof stubAnimate>) => runs.filter((r) => r.el === textBox());
const scoredAt = (score: number): ScoredAnswers => {
  const a = fakeAnswers();
  for (const ax of AXES) a.scores[ax] = { ...a.scores[ax], score, sd: 0.5 };
  return a;
};
const fortuneFill = () =>
  document.querySelector<HTMLElement>("[data-score-row] [data-fill]")!.style.width;

test("a step keeps the frame's own nodes and changes only what the passage changes", () =>
  withTimers(() => {
    stubSpeech();
    const { rerender } = render(<PassageDrawer beat={0} {...stepProps} />);
    expect(screen.getByRole("region", { name: "Passage" })).toHaveClass("enter");
    const frame = () => [
      screen.getByText("Fortune"),
      screen.getByText("The passage"),
      screen.getByText("Writing"),
      screen.getByText("ill · good"),
      screen.getByRole("button", { name: /earlier/ }),
      screen.getByRole("button", { name: "Read aloud" }),
      textBox(),
    ];
    const before = frame();
    rerender(<PassageDrawer beat={1} {...stepProps} />);
    // The new passage is there at once, in the same box, and the old one is gone.
    expect(passages()).toEqual(["b"]);
    expect(screen.getByText(/Passage 2 of 4/)).toBeInTheDocument();
    frame().forEach((node, i) => expect(node).toBe(before[i]));
    expect(document.querySelector(".enter .enter")).toBeNull();
  }));

test("each passage starts at the top of the box", () =>
  withTimers(() => {
    const { rerender } = render(<PassageDrawer beat={0} {...stepProps} />);
    textBox().scrollTop = 120;
    rerender(<PassageDrawer beat={1} {...stepProps} />);
    expect(textBox().scrollTop).toBe(0);
  }));

test("the text is written in from the top on opening, and each step cuts the sweep short and starts it again", () =>
  withTimers(() => {
    vi.stubGlobal("CSS", { supports: () => true });
    const runs = stubAnimate();
    const { rerender } = render(<PassageDrawer beat={0} {...stepProps} />);
    expect(sweeps(runs)).toHaveLength(1);
    const [first] = sweeps(runs);
    const keyframes = first.keyframes;
    expect(keyframes.map((k) => k.maskPosition)).toEqual(["0 100%", "0 0"]);
    expect(String(keyframes[0].maskImage)).toContain("transparent");
    expect(first.options.duration).toBeGreaterThanOrEqual(280);
    expect(first.options.duration).toBeLessThanOrEqual(520);
    // Soft at both ends with an even middle, so it reads as writing.
    expect(first.options.easing).toBe("cubic-bezier(.3, .1, .3, 1)");
    rerender(<PassageDrawer beat={1} {...stepProps} />);
    expect(first.anim.cancel).toHaveBeenCalled();
    expect(sweeps(runs)).toHaveLength(2);
    expect(sweeps(runs)[1].anim.cancel).not.toHaveBeenCalled();
  }));

test("a change in the passage's own controls does not write the text in again", () =>
  withTimers(() => {
    vi.stubGlobal("CSS", { supports: () => true });
    stubSpeech();
    const runs = stubAnimate();
    const { rerender } = render(<PassageDrawer beat={0} {...stepProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Read aloud" }));
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    rerender(<PassageDrawer beat={0} {...stepProps} />);
    expect(sweeps(runs)).toHaveLength(1);
    expect(sweeps(runs)[0].anim.cancel).not.toHaveBeenCalled();
  }));

test("where masks are not drawn the text fades in instead", () =>
  withTimers(() => {
    vi.stubGlobal("CSS", { supports: () => false });
    const runs = stubAnimate();
    render(<PassageDrawer beat={0} {...stepProps} />);
    expect(sweeps(runs)[0].keyframes).toEqual({ opacity: [0, 1] });
  }));

test("a burst of steps ends on the last passage, fully drawn, with every earlier motion cut short", () =>
  withTimers(() => {
    const runs = stubAnimate();
    const { rerender } = render(<PassageDrawer beat={0} {...stepProps} answers={scoredAt(4)} />);
    advance(100);
    const mid = parseFloat(fortuneFill());
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(48);
    // Each landing passage moves on from what is drawn, never back to nothing.
    rerender(<PassageDrawer beat={1} {...stepProps} answers={scoredAt(0)} />);
    expect(parseFloat(fortuneFill())).toBe(mid);
    for (const [beat, score] of [
      [2, 3],
      [3, 1],
    ]) {
      advance(16);
      rerender(<PassageDrawer beat={beat} {...stepProps} answers={scoredAt(score)} />);
    }
    expect(passages()).toEqual(["d"]);
    const boxRuns = runs.filter((r) => r.el.classList.contains("serif"));
    expect(boxRuns).toHaveLength(4);
    expect(boxRuns.slice(0, 3).every((r) => r.anim.cancel.mock.calls.length === 1)).toBe(true);
    expect(boxRuns[3].anim.cancel).not.toHaveBeenCalled();
    advance(300);
    expect(fortuneFill()).toBe("12px");
    expect(screen.getAllByText("1.0")).toHaveLength(AXES.length);
  }));

test("under reduced motion a step swaps the passage and its scores at once", () => {
  stubReducedMotion();
  const runs = stubAnimate();
  const { rerender } = render(<PassageDrawer beat={0} {...stepProps} answers={scoredAt(4)} />);
  expect(fortuneFill()).toBe("48px");
  rerender(<PassageDrawer beat={1} {...stepProps} answers={scoredAt(1)} />);
  expect(passages()).toEqual(["b"]);
  expect(fortuneFill()).toBe("12px");
  expect(runs).toHaveLength(0);
});

test("the chips come in as one only when the passage's events differ from the last one's", () =>
  withTimers(() => {
    const ev = (type: EventMarker["type"], beat_idx: number): EventMarker => ({
      type,
      beat_idx,
      bin: beat_idx * 10,
      probability: 0.8,
      strength: "strong",
    });
    const analysis = {
      ...fakeAnalysis(),
      events: [ev("reveal", 0), ev("reveal", 1), ev("death", 2)],
    };
    const runs = stubAnimate();
    const { rerender } = render(<PassageDrawer beat={0} {...stepProps} analysis={analysis} />);
    const chips = () => runs.filter((r) => r.el.tagName === "UL");
    expect(chips()).toHaveLength(0);
    rerender(<PassageDrawer beat={1} {...stepProps} analysis={analysis} />);
    expect(chips()).toHaveLength(0);
    rerender(<PassageDrawer beat={2} {...stepProps} analysis={analysis} />);
    expect(chips()).toHaveLength(1);
    expect(chips()[0].keyframes).toEqual({ opacity: [0, 1] });
    expect(chips()[0].options.duration).toBe(150);
  }));

test("scores are bars out of 4 with the number beside them, the scale's ends named once, and no ± left", async () => {
  const user = userEvent.setup();
  stubReducedMotion();
  render(
    <PassageDrawer
      beat={0}
      structure={fakeStructure(12)}
      analysis={fakeAnalysis()}
      answers={fakeAnswers()}
      text=""
      axes={["fortune", "tension"]}
      drivers={{}}
      onClose={() => {}}
      onSelect={() => {}}
    />,
  );
  const drawer = screen.getByRole("region", { name: "Passage" });
  expect(drawer.textContent).not.toContain("±");
  const rows = Array.from(drawer.querySelectorAll<HTMLElement>("[data-score-row]"));
  expect(rows).toHaveLength(AXES.length);
  for (const r of rows) expect(r.querySelector("[data-bar]")).toBeInTheDocument();
  expect(within(rows[0]).getByText("2.1 of 4, ill to good")).toHaveClass("sr-only");
  // 2.1 fills 25.2 px; its spread of 0.6 runs from 1.5 to 2.7.
  expect(rows[0].querySelector<HTMLElement>("[data-fill]")!.style.width).toBe("25.2px");
  expect(rows[0].querySelector<HTMLElement>("[data-range]")!.style.left).toBe("18px");
  expect(rows[0].querySelector<HTMLElement>("[data-range]")!.style.width).toBe("14.4px");
  // The ends of the first row's scale are printed under it, and only there.
  const ends = within(drawer).getByText("ill · good");
  expect(rows[0].nextElementSibling).toContainElement(ends);
  expect(within(drawer).getAllByText(/^\w+ · \w+$/)).toEqual([ends]);
  await user.click(screen.getByRole("button", { name: "What the range means" }));
  expect(screen.getByText(/range on the bar is how spread out they were/)).toBeInTheDocument();
});

test("axis names are set in ink, each beside its layer's swatch", () => {
  render(
    <PassageDrawer
      beat={0}
      structure={fakeStructure(12)}
      analysis={fakeAnalysis()}
      text=""
      axes={["dread"]}
      drivers={{}}
      onClose={() => {}}
      onSelect={() => {}}
    />,
  );
  const name = screen.getByText("Dread");
  expect(name.getAttribute("style")).toBeNull();
  expect(name.querySelector("svg line")).toHaveAttribute("stroke", "var(--ax-dread)");
});
