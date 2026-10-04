import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { api } from "../api/client";
import Compare from "../pages/Compare";
import Import from "../pages/Import";
import My from "../pages/My";
import Work from "../pages/Work";
import type { WorkSummary } from "../types";
import {
  fakeAnalysis,
  fakePreview,
  fakeStructure,
  fakeWork,
  json,
  refuseIndexedDB,
  renderAt,
  serve,
} from "./fixtures";

// Its own file because idb-keyval keeps the first connection it opens; here the store never opens at all.
beforeEach(refuseIndexedDB);

const serveAll = () =>
  serve({
    "/api/preview": () => json(fakePreview()),
    "/api/works": () => json({ work_id: "w1", structure: fakeStructure() }),
    "/api/works/w1": () =>
      json(
        fakeWork({
          title: "From the Server",
          structure: fakeStructure(),
          analysis: fakeAnalysis(),
          done: 12,
          total: 12,
        }),
      ),
    "/gallery/y.json": () =>
      json({ work: { title: "Work Y" }, structure: fakeStructure(), analysis: fakeAnalysis() }),
  });

test("with this browser refusing its store, Import still moves on to the work once the server has accepted it", async () => {
  serveAll();
  renderAt(
    <Routes>
      <Route path="/import" element={<Import />} />
      <Route path="/works/:id" element={<p>the work page</p>} />
    </Routes>,
    "/import",
  );
  await userEvent.type(screen.getByLabelText(/paste text/i), "some text");
  await userEvent.click(screen.getByRole("button", { name: "Preview" }));
  await screen.findByText(/About 112 passages/);
  await userEvent.type(screen.getByLabelText("TypeSafe API key"), "sk-12345678");
  await userEvent.click(screen.getByRole("button", { name: /^analyze$/i }));
  expect(await screen.findByText("the work page")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).toBeNull();
});

test("with this browser refusing its store, a work page draws from the server", async () => {
  serveAll();
  renderAt(
    <Routes>
      <Route path="/works/:id" element={<Work />} />
    </Routes>,
    "/works/w1",
  );
  expect(
    await screen.findByRole("heading", { level: 1, name: "From the Server" }),
  ).toBeInTheDocument();
});

test("with this browser refusing its store, Compare falls back to the server for a work of mine", async () => {
  serveAll();
  renderAt(<Compare />, "/compare?a=work:w1&b=gallery:y");
  expect(
    await screen.findByRole("img", { name: "Fortune: From the Server versus Work Y" }),
  ).toBeInTheDocument();
});

test("with this browser refusing its store, a delete the server accepted is not reported as failed", async () => {
  let works: WorkSummary[] = [
    {
      id: "w1",
      title: "From the Server",
      author: "A",
      kind: "novel",
      state: "complete",
      kept: true,
      word_count: 100,
      created_at: "",
      completed_at: null,
      expires_at: null,
      caption: null,
    },
  ];
  vi.spyOn(api, "myWorks").mockImplementation(async () => ({ works }));
  vi.spyOn(api, "remove").mockImplementation(async () => {
    works = [];
  });
  vi.stubGlobal("confirm", () => true);
  renderAt(<My />);
  await userEvent.click(await screen.findByRole("button", { name: "Delete" }));
  await waitFor(() => expect(screen.queryByText("From the Server")).toBeNull());
  expect(screen.queryByRole("alert")).toBeNull();
});
