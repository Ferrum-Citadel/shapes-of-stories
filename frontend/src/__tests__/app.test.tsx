import "fake-indexeddb/auto";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Shell, pages } from "../App";
import Nav from "../components/Nav";
import { fakeAnalysis, fakeStructure, json, renderAt, renderRoutes, serve } from "./fixtures";

const at = (path: string) => renderRoutes(pages, path);
const site = [{ element: <Shell />, children: pages }];
const galleryWork = (title: string) => ({
  work: { title, author: "A", word_count: 1, kind: "novel", format: "txt", content_hash: "" },
  structure: fakeStructure(),
  analysis: fakeAnalysis(),
});

test("/gallery redirects to the wall and unknown paths get a headed 404 with a way back", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => [] })),
  );
  at("/gallery");
  expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
    /every story has a shape/i,
  );
  at("/nowhere");
  expect(
    screen.getByRole("heading", { level: 1, name: "Nothing at this address" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Back to the gallery" })).toHaveAttribute("href", "/");
});

test.each([
  ["/gallery/nowhere", "Not in the gallery"],
  ["/shared/nowhere", "Nothing at this link"],
])(
  "%s names what is missing in a heading, alerts, and links back to the wall",
  async (path, heading) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "not_found" }), { status: 404 })),
    );
    at(path);
    expect(await screen.findByRole("heading", { level: 1, name: heading })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toContainElement(screen.getByRole("heading", { level: 1 }));
    expect(screen.getByRole("link", { name: "Back to the gallery" })).toHaveAttribute("href", "/");
  },
);

test("a page that breaks while drawing gets a quiet page with a way home, and the next page draws again", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.endsWith(".txt")
        ? new Response("text")
        : url.endsWith("/questions.json")
          ? json({ version: "q", axes: [], events: [] })
          : json({}),
    ),
  );
  renderRoutes(site, "/gallery/broken");
  expect(
    await screen.findByRole("heading", { level: 1, name: "This page could not be drawn" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Something in it went wrong on my side, not yours. Reloading may help; the rest of the site should still work.",
  );
  expect(screen.getByRole("link", { name: "Back to the gallery" })).toHaveAttribute("href", "/");
  await userEvent.click(
    within(screen.getByRole("navigation", { name: "Site" })).getByRole("link", { name: "About" }),
  );
  expect(await screen.findByRole("heading", { level: 1, name: "About" })).toBeInTheDocument();
});

test("stepping to a gallery work whose file is slow moves at once and starts it fresh", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      url.includes("/gallery/b.")
        ? new Promise(() => {})
        : Promise.resolve(
            url.endsWith(".txt")
              ? new Response("text")
              : json(url.endsWith("/index.json") ? [] : galleryWork("Work A")),
          ),
    ),
  );
  const { router } = renderRoutes(site, "/gallery/a");
  expect(await screen.findByRole("heading", { level: 1, name: "Work A" })).toBeInTheDocument();
  await act(() => router.navigate("/gallery/b"));
  expect(screen.queryByRole("heading", { level: 1, name: "Work A" })).toBeNull();
  expect(screen.getByRole("status")).toHaveTextContent("Loading the work…");
});

test("each page names itself in the tab's title, and moving to another page moves focus to it", async () => {
  serve({ "/api/session/works": () => json({ works: [] }) });
  renderRoutes(site, "/");
  await screen.findByRole("heading", { level: 1, name: /every story has a shape/i });
  expect(document.title).toBe("Shapes of Stories");
  expect(screen.getByRole("main")).not.toHaveFocus();
  await userEvent.click(
    within(screen.getByRole("navigation", { name: "Site" })).getByRole("link", {
      name: "My works",
    }),
  );
  expect(await screen.findByRole("heading", { level: 1, name: "My works" })).toBeInTheDocument();
  expect(document.title).toBe("My works · Shapes of Stories");
  expect(screen.getByRole("main")).toHaveFocus();
});

test.each([
  ["/about", "About · Shapes of Stories"],
  ["/privacy", "Privacy · Shapes of Stories"],
  ["/import", "Analyze a book · Shapes of Stories"],
  ["/compare", "Compare two works · Shapes of Stories"],
  ["/nowhere", "Nothing at this address · Shapes of Stories"],
  ["/gallery/a", "Work A · Shapes of Stories"],
])("%s is titled %j", async (path, title) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.endsWith(".txt")
        ? new Response("text")
        : url.endsWith("/gallery/a.json")
          ? json(galleryWork("Work A"))
          : url.endsWith("/questions.json")
            ? json({ version: "q", axes: [], events: [] })
            : json([]),
    ),
  );
  renderRoutes(site, path);
  await waitFor(() => expect(document.title).toBe(title));
  expect(screen.queryByText("This page could not be drawn")).toBeNull();
});

test("the bar ends with the one primary action, then a theme button that cycles and remembers", async () => {
  renderAt(<Nav />);
  const links = within(screen.getByRole("navigation", { name: "Site" })).getAllByRole("link");
  expect(links.map((l) => l.textContent)).toEqual(["Gallery", "Compare", "My works", "About"]);
  // The pill leaves the links' row so a phone can seat it in the title row, and the tab order follows the bar.
  const bar = screen.getByRole("banner");
  expect(
    [...bar.querySelectorAll("a, button")].map(
      (e) => e.getAttribute("aria-label") ?? e.textContent,
    ),
  ).toEqual([
    "Shapes of Stories",
    "Gallery",
    "Compare",
    "My works",
    "About",
    "Analyze a book\u00a0→",
    "Theme: dark",
  ]);
  const pill = within(bar).getByRole("link", { name: "Analyze a book" });
  expect(pill).toHaveAttribute("href", "/import");
  const button = screen.getByRole("button", { name: "Theme: dark" });
  for (const [label, stored, shown] of [
    ["light", "light", "light"],
    ["system", "system", "light"],
    ["dark", null, "dark"],
  ]) {
    await userEvent.click(button);
    expect(button).toHaveAccessibleName(`Theme: ${label}`);
    expect(localStorage.getItem("sos.theme")).toBe(stored);
    expect(document.documentElement.dataset.theme).toBe(shown);
  }
});

test("a skip link leads past the navigation to the page", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => json([])),
  );
  renderRoutes(site);
  await screen.findByRole("heading", { level: 1, name: /every story has a shape/i });
  const skip = screen.getAllByRole("link")[0];
  expect(skip).toHaveAccessibleName("Skip to the content");
  expect(skip).toHaveAttribute("href", "#main");
  expect(screen.getByRole("main")).toHaveAttribute("id", "main");
});

test("a shared link to a work that has not finished says so plainly", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      json({ id: "w1", title: "T", author: null, structure: fakeStructure(), analysis: null }),
    ),
  );
  at("/shared/tok_0123456789abcdefgh");
  // The page says it is loading first, so the check waits for the line that replaces it.
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent(
      "This analysis has not finished yet. Try the link again in a while.",
    ),
  );
});

test("a redirect on the first load leaves focus alone, so the first Tab reaches the skip link", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => json([])),
  );
  renderRoutes(site, "/gallery");
  await screen.findByRole("heading", { level: 1, name: /every story has a shape/i });
  await waitFor(() => expect(screen.queryByText("Loading the wall…")).toBeNull());
  expect(screen.getByRole("main")).not.toHaveFocus();
  await userEvent.tab();
  expect(screen.getByRole("link", { name: "Skip to the content" })).toHaveFocus();
});
