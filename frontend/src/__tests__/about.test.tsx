import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import About from "../pages/About";

test("about prints every question under its name and speaks in the first person", async () => {
  vi.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    json: async () => ({
      version: "q4",
      axes: [
        {
          key: "fortune",
          name: "Fortune",
          question: "How well…",
          levels: ["a", "b", "c", "d", "e"],
        },
        {
          key: "tension",
          name: "Tension",
          question: "How much…",
          levels: ["a", "b", "c", "d", "e"],
        },
      ],
      events: [{ key: "reveal", name: "Reveal", question: "Does…" }],
    }),
  } as Response);
  render(
    <MemoryRouter>
      <About />
    </MemoryRouter>,
  );
  expect(await screen.findByText("How well…")).toBeInTheDocument();
  expect(screen.getByText(/I wanted to know/)).toBeInTheDocument();
  expect(screen.getByText(/a pointer, not a proof/)).toBeInTheDocument();
  expect(screen.getByText(/as far as the reading can tell/)).toBeInTheDocument();
  expect(document.body).not.toHaveTextContent(/red line|model noticed|model can tell|model judged/);
  expect(screen.getByText(/Tian/)).toBeInTheDocument();
});

test("about groups the questions as the chips do, then the events, under their own labels", async () => {
  vi.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    json: async () => ({
      version: "q4",
      axes: [
        {
          key: "fortune",
          name: "Fortune",
          question: "How well…",
          levels: ["a", "b", "c", "d", "e"],
        },
        {
          key: "tension",
          name: "Tension",
          question: "How much…",
          levels: ["a", "b", "c", "d", "e"],
        },
      ],
      events: [{ key: "reveal", name: "Reveal", question: "Does…" }],
    }),
  } as Response);
  render(
    <MemoryRouter>
      <About />
    </MemoryRouter>,
  );
  const feeling = await screen.findByRole("region", { name: "Feeling" });
  expect(feeling).toContainElement(screen.getByText("How well…"));
  expect(feeling).not.toContainElement(screen.getByText("How much…"));
  expect(screen.getByRole("region", { name: "Telling" })).toContainElement(
    screen.getByText("How much…"),
  );
  expect(screen.getByRole("region", { name: "Events" })).toContainElement(
    screen.getByText("Does…"),
  );
});

test("about says so when the questions cannot be loaded and keeps the rest of the page", async () => {
  vi.spyOn(global, "fetch").mockRejectedValue(new Error("offline"));
  render(
    <MemoryRouter>
      <About />
    </MemoryRouter>,
  );
  expect(await screen.findByText("The questions could not be loaded.")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Why" })).toBeInTheDocument();
});

test("a link to the layers lands on the questions in full", () => {
  vi.spyOn(global, "fetch").mockReturnValue(new Promise(() => {}));
  // jsdom has no scrollIntoView, and a spy needs one to wrap.
  Element.prototype.scrollIntoView = () => {};
  const scroll = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
  try {
    render(
      <MemoryRouter initialEntries={["/about#layers"]}>
        <About />
      </MemoryRouter>,
    );
    const layers = screen.getByRole("heading", { name: "The questions, in full" }).parentElement!;
    expect(layers).toHaveAttribute("id", "layers");
    expect(scroll.mock.contexts).toEqual([layers]);
  } finally {
    Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  }
});

const questions = {
  version: "q4",
  axes: [
    { key: "fortune", name: "Fortune", question: "How well…", levels: ["a", "b", "c", "d", "e"] },
  ],
  events: [{ key: "reveal", name: "Reveal", question: "Does…" }],
};
function openAbout() {
  vi.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    json: async () => questions,
  } as Response);
  render(
    <MemoryRouter>
      <About />
    </MemoryRouter>,
  );
}

test("about runs its sections in order, says why in one place and opens How with its source", async () => {
  openAbout();
  await screen.findByText("How well…");
  expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
    "Why",
    "How",
    "What the numbers mean",
    "The questions, in full",
    "Credits",
    "What this is not",
  ]);
  const why = screen.getByRole("heading", { name: "Why" }).parentElement!;
  expect(why.querySelector("p")).toHaveTextContent(
    /^It began as a creative way to find out what Jev/,
  );
  expect(why).toHaveTextContent(/typed questions/);
  expect(why).toHaveTextContent(/drawing/);
  expect(why).not.toHaveTextContent(/dip|blackboard/);
  const how = screen.getByRole("heading", { name: "How" }).parentElement!.querySelector("p")!;
  expect(how).toHaveTextContent(
    /^Kurt Vonnegut drew stories as lines on a blackboard, and in 2016 Andrew Reagan and colleagues found six basic shapes in 1,327 Project Gutenberg books; this site draws one book at a time\.$/,
  );
});

test("the numbers are three items, each with its sketch", async () => {
  openAbout();
  const strip = (await screen.findByRole("heading", { name: "What the numbers mean" }))
    .parentElement!;
  expect(within(strip).getAllByRole("heading", { level: 3 })).toHaveLength(3);
  expect(strip.querySelectorAll("svg[aria-hidden=true]")).toHaveLength(3);
});

test("the questions sit collapsed under a disclosure per group", async () => {
  openAbout();
  const question = await screen.findByText("How well…");
  const groups = [...document.querySelectorAll("#layers details")];
  expect(groups.map((d) => d.querySelector("summary")!.textContent)).toEqual([
    "Feeling",
    "Telling",
    "Events",
  ]);
  for (const d of groups) expect(d).not.toHaveAttribute("open");
  expect(question).not.toBeVisible();
});

test("credits pair each work with what it gave, linking only the verified ones", async () => {
  openAbout();
  const list = (
    await screen.findByRole("heading", { name: "Credits" })
  ).parentElement!.querySelector("dl")!;
  const terms = within(list).getAllByRole("term");
  expect(terms.length).toBe(within(list).getAllByRole("definition").length);
  expect(within(list).getByRole("link", { name: /six basic shapes/ })).toHaveAttribute(
    "href",
    "https://arxiv.org/abs/1606.07772",
  );
  expect(within(list).getByRole("link", { name: /REMAN/ })).toHaveAttribute(
    "href",
    "https://aclanthology.org/C18-1114/",
  );
  const vonnegut = terms.find((t) => t.textContent?.startsWith("Kurt Vonnegut"))!;
  expect(within(vonnegut).queryByRole("link")).toBeNull();
  expect(vonnegut.nextElementSibling).toHaveTextContent(/fortune axis/);
});

test("a link to the layers opens every group, so the definitions it points at are in view", async () => {
  vi.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    json: async () => questions,
  } as Response);
  Element.prototype.scrollIntoView = () => {};
  onTestFinished(() => {
    Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  });
  render(
    <MemoryRouter initialEntries={["/about#layers"]}>
      <About />
    </MemoryRouter>,
  );
  expect(await screen.findByText("How well…")).toBeVisible();
  const groups = [...document.querySelectorAll("#layers details")];
  expect(groups).toHaveLength(3);
  for (const d of groups) expect(d).toHaveAttribute("open");
});
