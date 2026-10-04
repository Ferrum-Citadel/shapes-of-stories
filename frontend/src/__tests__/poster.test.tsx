import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PosterButton from "../poster/Poster";
import { sanitizeFilename } from "../lib/download";
import { LEGEND, legendWidth, posterSvg, SIZES } from "../poster/export";
import { svgToPng, wrap } from "../poster/svg";
import { EVENT_PATHS } from "../components/icons";
import { COLOPHON, EVENT_NAMES, SHAPE_INFO } from "../lib/definitions";
import { AXES, type Analysis, type Axis } from "../types";
import { catchDownloads, cssTokens, fakeAnalysis, previewSvg } from "./fixtures";

const FONTS = {
  title: "data:font/woff2;base64,AA==",
  text: "data:font/woff2;base64,BB==",
  italic: "data:font/woff2;base64,CC==",
};
const NO_FONTS = { title: "", text: "", italic: "" };

// jsdom has no modal dialogs, so these only mark the dialog open and fire its close event, which is all the poster uses.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
}

const PASSAGE = "SENTINEL-PASSAGE-TEXT-NEVER-ON-A-POSTER";

function posterAnalysis(): Analysis {
  const a = fakeAnalysis();
  return {
    ...a,
    archetype: {
      state: "named",
      shape: "fall_rise",
      caption: "A Man in a Hole",
      r: 0.8,
      margin: 0.3,
    },
    events: [
      { type: "death", beat_idx: 1, bin: 30, probability: 0.9, strength: "strong" },
      { type: "reveal", beat_idx: 2, bin: 60, probability: 0.4, strength: "faint" },
    ],
    chapters: [{ ...a.chapters[0], title: "I", word_count: 100, beats: 4 }],
  };
}

test("posterSvg escapes user strings and drops characters XML forbids", () => {
  const svg = posterSvg({
    title: 'A <Title> & "Quotes"\u0007',
    subtitle: "By <Author>\u0000",
    analysis: posterAnalysis(),
    axes: ["fortune", "tension"],
    size: "portrait",
    palette: "paper",
    fonts: FONTS,
  });
  expect(
    new DOMParser().parseFromString(svg, "image/svg+xml").querySelector("parsererror"),
  ).toBeNull();
  expect(svg.includes("\u0000") || svg.includes("\u0007")).toBe(false);
  expect(svg).not.toContain("<Title>");
  expect(svg).toContain("A &lt;Title&gt; &amp; &quot;Quotes&quot;");
  expect(svg).toContain("By &lt;Author&gt;");
  expect(svg).toContain("Man in a Hole");
  expect(svg).not.toContain("A Man in a Hole");
  expect(svg).toContain(">shapesofstories</text>");
  expect(svg).toContain(COLOPHON.split(" ").slice(0, 6).join(" "));
});

test("the reading sentence names a titled chapter, and nothing but the analysis reaches the poster", () => {
  const a = posterAnalysis();
  const means = (fortune: number, tension: number) =>
    Object.fromEntries(
      AXES.map((ax) => [ax, ax === "fortune" ? fortune : ax === "tension" ? tension : 2]),
    ) as Record<Axis, number | null>;
  // A local copy keeps the reader's text beside its analysis; the poster must read only the analysis.
  const analysis = {
    ...a,
    text: PASSAGE,
    chapters: [
      { ...a.chapters[0], idx: 0, title: "The Valley of Ashes", means: means(3, 1) },
      { ...a.chapters[0], idx: 1, title: "The Last Party", means: means(1, 3), start_bin: 50 },
    ],
  };
  const svg = posterSvg({
    title: "T",
    subtitle: "S",
    analysis,
    axes: ["fortune"],
    size: "portrait",
    palette: "paper",
    fonts: NO_FONTS,
  });
  expect(svg).toContain("The Valley of Ashes");
  expect(svg).toContain("The Last Party");
  expect(svg).not.toContain(PASSAGE);
});

test("wrap cuts an over-long word, and its ellipsis drops a word only when it must", () => {
  expect(wrap("abcdefghij", 4, 1, 1, 9)).toEqual(["abcd", "efgh", "ij"]);
  expect(wrap("aa bb cc dd", 6, 1, 1, 1)).toEqual(["aa bb…"]);
  expect(wrap("aaa bb cc", 6, 1, 1, 1)).toEqual(["aaa…"]);
  expect(wrap("abcdefghij", 4, 1, 1, 1)).toEqual(["abc…"]);
});

test("svgToPng lets go of its object URL whether the PNG is made, the SVG fails, or the canvas fails", async () => {
  const revoked: string[] = [];
  const { createObjectURL, revokeObjectURL } = URL;
  URL.createObjectURL = vi.fn(() => "blob:poster");
  URL.revokeObjectURL = vi.fn((u: string) => void revoked.push(u));
  let loads = true;
  let blob: Blob | null = new Blob(["png"]);
  vi.stubGlobal(
    "Image",
    class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_: string) {
        queueMicrotask(() => (loads ? this.onload?.() : this.onerror?.()));
      }
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: () => {},
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb: BlobCallback) =>
    cb(blob),
  );
  try {
    await expect(svgToPng("<svg/>", 1, 1)).resolves.toBe(blob);
    blob = null;
    await expect(svgToPng("<svg/>", 1, 1)).rejects.toThrow("toBlob failed");
    loads = false;
    await expect(svgToPng("<svg/>", 1, 1)).rejects.toThrow("svg render failed");
    expect(revoked).toEqual(["blob:poster", "blob:poster", "blob:poster"]);
  } finally {
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
  }
});

test("posterSvg draws fortune and each chosen layer once, at the requested size", () => {
  const [W, H] = SIZES.landscape;
  const svg = posterSvg({
    title: "T",
    subtitle: "S",
    analysis: posterAnalysis(),
    axes: ["tension", "mystery"],
    size: "landscape",
    palette: "ink",
    fonts: NO_FONTS,
  });
  expect(svg).toContain(`width="${W}" height="${H}"`);
  expect([...svg.matchAll(/data-layer="(\w+)"/g)].map((m) => m[1]).sort()).toEqual([
    "fortune",
    "mystery",
    "tension",
  ]);
  expect(svg).toMatch(/data-layer="mystery"[^>]*stroke-dasharray="10 8"/);
});

test("posterSvg sets out the reading sentence, the shape's ghost, chapter ticks, a bar per layer and the facts", () => {
  const a = posterAnalysis();
  const means = Object.fromEntries(AXES.map((ax) => [ax, ax === "pace" ? null : 2])) as Record<
    Axis,
    number | null
  >;
  const svg = posterSvg({
    title: "T",
    subtitle: "S",
    analysis: {
      ...a,
      chapters: [
        { ...a.chapters[0], idx: 0, title: "I", word_count: 1200, beats: 3, start_bin: 0, means },
        { ...a.chapters[0], idx: 1, title: "II", word_count: 800, beats: 2, start_bin: 60, means },
      ],
    },
    axes: ["fortune"],
    size: "square",
    palette: "paper",
    fonts: NO_FONTS,
    date: new Date(2026, 9, 4),
  });
  expect(svg).toMatch(/<text[^>]*font-style="italic"[^>]*>A man in a hole\.<\/text>/);
  expect(svg).toContain("data-ghost");
  // A layer no chapter scored keeps its empty track and a dash.
  expect((svg.match(/data-bar=/g) ?? []).length).toBe(AXES.length - 1);
  expect(svg).toContain("2,000 words · 2 chapters · 5 passages · October 4, 2026");
  expect(svg).toContain(SHAPE_INFO.fall_rise.description.split(" ").slice(0, 4).join(" "));
  // One tick for the second chapter's start; the first starts at the left edge.
  expect((svg.match(/y2="[\d.]+" stroke="#1b1917" stroke-opacity="0.3"\/>/g) ?? []).length).toBe(1);
});

test("loadFonts clears a font that failed or came back as an error from its cache so the next call retries, and encodes files past 64 KB whole", async () => {
  vi.resetModules();
  const { loadFonts } = await import("../poster/font");
  let calls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      calls++;
      if (calls === 1) throw new Error("network down");
      if (calls === 2) return new Response("<!doctype html>", { status: 404 });
      return new Response(new Uint8Array(70000));
    }),
  );
  await expect(loadFonts()).rejects.toThrow("network down");
  const fonts = await loadFonts();
  expect(fonts.title.startsWith("data:font/woff2;base64,")).toBe(true);
  expect(fonts.text.startsWith("data:font/woff2;base64,")).toBe(true);
  expect(atob(fonts.text.split(",")[1]).length).toBe(70000);
  // The first call fetched all three files and only the two failed ones are fetched again.
  expect(calls).toBe(5);
});

function textTag(svg: string, content: string) {
  return svg.match(new RegExp(`<text[^>]*>${content}</text>`))?.[0] ?? "";
}

test("posterSvg sets the title and subtitle in Fraunces, embeds all three font files, and uses no symbol characters", () => {
  const svg = posterSvg({
    title: "My Book",
    subtitle: "An Author",
    analysis: posterAnalysis(),
    axes: ["fortune"],
    size: "portrait",
    palette: "paper",
    fonts: FONTS,
  });
  expect(textTag(svg, "My Book")).toContain('font-family="Fraunces"');
  expect(textTag(svg, "An Author")).toContain('font-family="Fraunces"');
  expect((svg.match(/@font-face/g) ?? []).length).toBe(3);
  expect(svg).toContain(FONTS.title);
  expect(svg).toContain(FONTS.text);
  expect(svg).toMatch(/font-style:italic;src:url\(data:font\/woff2;base64,CC==\)/);
  expect(svg).not.toMatch(/[\u2600-\u27bf]/);
});

test("posterSvg captions with the shape name, leans toward it when unsure, and says no clear shape otherwise", () => {
  const draw = (archetype: Partial<Analysis["archetype"]>) =>
    posterSvg({
      title: "T",
      subtitle: "S",
      analysis: { ...posterAnalysis(), archetype: { ...posterAnalysis().archetype, ...archetype } },
      axes: ["fortune"],
      size: "portrait",
      palette: "paper",
      fonts: NO_FONTS,
    });
  expect(draw({})).toContain(">Man in a Hole</text>");
  expect(draw({ state: "leans" })).toContain(">Leans toward Man in a Hole</text>");
  expect(draw({ state: "none", shape: null })).toContain(">No clear shape</text>");
  expect(draw({ state: "leans", shape: "no_such_shape" })).toContain(">No clear shape</text>");
});

test("posterSvg draws strong events as glyph paths and the fortune line in the palette accent", () => {
  const draw = (palette: "paper" | "ink") =>
    posterSvg({
      title: "T",
      subtitle: "S",
      analysis: posterAnalysis(),
      axes: ["fortune", "tension"],
      size: "portrait",
      palette,
      fonts: NO_FONTS,
    });
  const paper = draw("paper");
  expect(paper).toContain(`d="${EVENT_PATHS.death}"`);
  expect(paper).not.toContain(`d="${EVENT_PATHS.reveal}"`);
  expect(paper).toMatch(/data-layer="fortune"[^>]*stroke="#815e1e"/);
  expect(paper).toContain('fill="#f3efe5"');
  const ink = draw("ink");
  expect(ink).toMatch(/data-layer="fortune"[^>]*stroke="#d1b05a"/);
  expect(ink).toContain('fill="#131211"');
});

test("posterSvg draws at most eight event glyphs, each a whole glyph on the 24 grid, none overlapping", () => {
  const types = Object.keys(EVENT_PATHS) as (keyof typeof EVENT_PATHS)[];
  // A long book's strong events crowd every few bins, as The Great Gatsby's 126 do.
  const events = Array.from({ length: 120 }, (_, i) => ({
    type: types[i % types.length],
    beat_idx: i,
    bin: Math.floor((i * 100) / 120),
    probability: 0.5 + ((i * 37) % 50) / 100,
    strength: "strong" as const,
  }));
  const svg = posterSvg({
    title: "T",
    subtitle: "S",
    analysis: { ...posterAnalysis(), events },
    axes: ["fortune"],
    size: "portrait",
    palette: "paper",
    fonts: NO_FONTS,
  });
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  // A standalone file is read as XML, so one malformed attribute would blank the whole poster.
  expect(doc.querySelector("parsererror")).toBeNull();
  const glyphs = [...doc.querySelectorAll("path[data-bead]")];
  expect(glyphs.length).toBe(8);
  for (const g of glyphs) expect(Object.values(EVENT_PATHS)).toContain(g.getAttribute("d"));
  const xs = glyphs.map((g) => {
    const t = g.getAttribute("transform") ?? g.parentElement?.getAttribute("transform") ?? "";
    const m = t.match(/^translate\(([-\d.]+),([-\d.]+)\) scale\(([-\d.]+)\)$/);
    expect(m, t).not.toBeNull();
    // The glyph's 24 units are scaled once, to the glyph's drawn size.
    expect(+m![3] * 24).toBeCloseTo(28);
    expect(g.getAttribute("fill")).toBe("none");
    expect(g.getAttribute("stroke-linecap")).toBe("round");
    return +m![1];
  });
  for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(32);
});

test("the legend names each drawn event type once, in book order, in items that never overlap", () => {
  const order = [
    "arrival_departure",
    "reconciliation",
    "confrontation",
    "arrival_departure",
    "location_change",
    "decision",
    "betrayal",
    "injury_violence",
  ] as const;
  const events = order.map((type, i) => ({
    type,
    beat_idx: i,
    bin: 4 + i * 12,
    probability: 0.9,
    strength: "strong" as const,
  }));
  for (const size of ["portrait", "landscape", "square"] as const) {
    const [W] = SIZES[size];
    const svg = posterSvg({
      title: "T",
      subtitle: "S",
      analysis: { ...posterAnalysis(), events },
      axes: ["fortune"],
      size,
      palette: "paper",
      fonts: NO_FONTS,
    });
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    expect(doc.querySelectorAll("path[data-bead]")).toHaveLength(8);
    const items = [...doc.querySelectorAll("[data-legend-item]")].map((g) => {
      const [, x, y] = g.getAttribute("transform")!.match(/translate\(([-\d.]+),([-\d.]+)\)/)!;
      const name = g.querySelector("text")!.textContent!;
      // A generous 0.55 em a character, wider than Fraunces italic sets.
      return { name, y: +y, l: +x, r: +x + LEGEND.glyph + 7 + name.length * LEGEND.size * 0.55 };
    });
    expect(
      items.map((it) => it.name),
      size,
    ).toEqual([...new Set(order)].map((t) => EVENT_NAMES[t]));
    expect(new Set(items.map((it) => it.y)).size, size).toBeLessThanOrEqual(2);
    for (const it of items) expect(it.l + legendWidth(it.name), size).toBeLessThanOrEqual(W - 80);
    for (const a of items)
      for (const b of items)
        if (a !== b && a.y === b.y) expect(a.r <= b.l || b.r <= a.l, size).toBe(true);
  }
});

test("sanitizeFilename replaces slashes, backslashes, and control characters, and falls back to 'poster' when empty", () => {
  expect(sanitizeFilename("My/Book\\Title")).toBe("My_Book_Title");
  expect(sanitizeFilename("Tab\tHere")).toBe("Tab_Here");
  expect(sanitizeFilename("   ")).toBe("poster");
  expect(sanitizeFilename("")).toBe("poster");
  expect(sanitizeFilename(" ", "work")).toBe("work");
});

test("sanitizeFilename cuts a long title to 120 characters without splitting one", () => {
  expect(sanitizeFilename("a".repeat(300))).toBe("a".repeat(120));
  expect(sanitizeFilename("😀".repeat(130))).toBe("😀".repeat(120));
  expect(sanitizeFilename(`${"a".repeat(119)} b`)).toBe("a".repeat(119));
});

test("poster button opens a dialog with size, palette, and download controls", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(new ArrayBuffer(8))),
  );
  render(
    <PosterButton
      title="My Book"
      subtitle="An Author"
      analysis={posterAnalysis()}
      axes={["fortune"]}
    />,
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await userEvent.click(screen.getByText("Poster"));
  expect(screen.getByRole("dialog", { name: "Poster" })).toBeInTheDocument();
  expect(screen.getByLabelText("Size")).toBeInTheDocument();
  expect(screen.getByLabelText("Palette")).toBeInTheDocument();
  expect(screen.getByText("Download PNG")).toBeInTheDocument();
  expect(screen.getByText("Download SVG")).toBeInTheDocument();
  expect(screen.getByLabelText("Close").querySelector("svg")).not.toBeNull();
  expect(screen.getByLabelText("Close").textContent).toBe("");
  await userEvent.click(screen.getByLabelText("Close"));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

async function openPosterWithFontsLoaded() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(new ArrayBuffer(8))),
  );
  render(
    <PosterButton
      title="My Book"
      subtitle="An Author"
      analysis={posterAnalysis()}
      axes={["fortune"]}
    />,
  );
  await userEvent.click(screen.getByText("Poster"));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return screen.getByRole("dialog", { name: "Poster" });
}

test("the dialog starts in the palette of the site's resolved theme, ink unless it is light", async () => {
  document.documentElement.dataset.theme = "light";
  const { unmount } = render(
    <PosterButton title="B" subtitle="A" analysis={posterAnalysis()} axes={[]} />,
  );
  await userEvent.click(screen.getByText("Poster"));
  expect(await previewSvg()).toContain('fill="#f3efe5"');
  unmount();
  document.documentElement.dataset.theme = "dark";
  render(<PosterButton title="B" subtitle="A" analysis={posterAnalysis()} axes={[]} />);
  await userEvent.click(screen.getByText("Poster"));
  expect(await previewSvg()).toContain('fill="#131211"');
  delete document.documentElement.dataset.theme;
});

test("the dialog preview embeds no font faces, so it cannot touch the page's own Fraunces", async () => {
  const dialog = await openPosterWithFontsLoaded();
  const svg = await previewSvg(dialog);
  expect(svg).toContain("<svg");
  expect(svg).not.toContain("@font-face");
  expect(dialog.innerHTML).not.toContain("@font-face");
});

test("the dialog shows its preview as an image of an SVG blob and lets the old one go on change", async () => {
  const revoked = vi.spyOn(URL, "revokeObjectURL");
  const dialog = await openPosterWithFontsLoaded();
  const img = within(dialog).getByRole("img", { name: /portrait poster preview/i });
  expect(img.tagName).toBe("IMG");
  const first = img.getAttribute("src")!;
  expect(first).toMatch(/^blob:/);
  await userEvent.click(within(dialog).getByText("Square"));
  expect(revoked).toHaveBeenCalledWith(first);
  expect(img.getAttribute("src")).not.toBe(first);
  expect(await previewSvg(dialog)).toContain("<svg");
});

test("Download SVG embeds all three font faces in the exported file", async () => {
  const blobs: Blob[] = [];
  const { createObjectURL, revokeObjectURL } = URL;
  URL.createObjectURL = vi.fn((b: Blob) => (blobs.push(b), "blob:poster"));
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  try {
    await openPosterWithFontsLoaded();
    // The preview made its own blob as the dialog opened.
    const before = blobs.length;
    await userEvent.click(screen.getByText("Download SVG"));
    expect(blobs).toHaveLength(before + 1);
    const svg = await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.readAsText(blobs[before]);
    });
    expect((svg.match(/@font-face/g) ?? []).length).toBe(3);
    expect(svg).toContain("data:font/woff2;base64,");
  } finally {
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
  }
});

test("posterSvg writes every layer and its ground in the hex of the matching theme's tokens", () => {
  const themes = { paper: cssTokens(":root"), ink: cssTokens(':root[data-theme="dark"]') };
  for (const [palette, t] of Object.entries(themes) as [
    "paper" | "ink",
    Record<string, string>,
  ][]) {
    const svg = posterSvg({
      title: "T",
      subtitle: "S",
      analysis: posterAnalysis(),
      axes: [...AXES],
      size: "portrait",
      palette,
      fonts: NO_FONTS,
    });
    expect(svg).not.toContain("var(");
    expect(svg).toContain(`fill="${t["--bg"]}"`);
    expect(svg).toContain(`fill="${t["--paper"]}"`);
    expect(svg).toContain(`fill="${t["--ink"]}"`);
    expect(svg).toContain(`fill="${t["--muted"]}"`);
    for (const ax of AXES) {
      const hex = t[ax === "fortune" ? "--accent" : `--ax-${ax}`];
      expect(svg).toMatch(new RegExp(`data-layer="${ax}"[^>]*stroke="${hex}"`));
    }
  }
});

test("a PNG that cannot be made says so in the dialog", async () => {
  vi.stubGlobal(
    "Image",
    class {
      onerror: (() => void) | null = null;
      set src(_: string) {
        queueMicrotask(() => this.onerror?.());
      }
    },
  );
  catchDownloads();
  await openPosterWithFontsLoaded();
  await userEvent.click(screen.getByText("Download PNG"));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "The PNG could not be made in this browser; the SVG should still download.",
  );
});
