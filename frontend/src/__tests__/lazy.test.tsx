import { act, screen } from "@testing-library/react";
import { Shell, pages, routes } from "../App";
import { renderRoutes } from "./fixtures";

// The privacy page's code arrives only when the test lets it.
const chunk = vi.hoisted(() => {
  let release = () => {};
  const held = new Promise<void>((r) => {
    release = r;
  });
  return { held, release: () => release() };
});
vi.mock("../pages/Privacy", async (actual) => {
  await chunk.held;
  return actual();
});
// The about page's code never arrives.
vi.mock("../pages/About", () => {
  throw new Error("chunk failed");
});

test("a page whose code is still on its way leaves the last page in place until it arrives", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("[]")),
  );
  const { router } = renderRoutes([{ element: <Shell />, children: pages }]);
  const wall = await screen.findByRole("heading", { level: 1, name: /every story has a shape/i });
  act(() => void router.navigate("/privacy"));
  await act(async () => {});
  expect(wall).toBeInTheDocument();
  chunk.release();
  expect(await screen.findByRole("heading", { level: 1, name: "Privacy" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { level: 1, name: /every story has a shape/i })).toBeNull();
});

test("a page whose code fails to arrive says so under the bar, not on the router's own page", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("[]")),
  );
  const { router } = renderRoutes(routes);
  await screen.findByRole("heading", { level: 1, name: /every story has a shape/i });
  await act(() => router.navigate("/about"));
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("This page could not be drawn");
  expect(screen.getByRole("main")).toContainElement(alert);
  expect(screen.getByRole("navigation", { name: "Site" })).toBeInTheDocument();
});
