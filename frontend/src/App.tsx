import { Component, useEffect, useRef, type ComponentType, type ReactNode } from "react";
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  ScrollRestoration,
  useLocation,
  useNavigationType,
  type RouteObject,
} from "react-router";
import Nav from "./components/Nav";
import Colophon from "./components/Colophon";
import Gallery from "./pages/Gallery";
import GalleryWork from "./pages/GalleryWork";
import PageNotice from "./components/PageNotice";
import { preloadWall, preloadWork } from "./lib/gallery";

// Most visits begin on the wall or a work and stay there, so the other pages are fetched only when first opened, and a move to one waits for its code with the last page still in view.
const later = (load: () => Promise<{ default: ComponentType }>) => async () => ({
  Component: (await load()).default,
});
export const pages: RouteObject[] = [
  {
    id: "wall",
    path: "/",
    element: <Gallery />,
    loader: preloadWall,
    // The search and the arrangement change only the address's query, so a keystroke never waits on the loader.
    shouldRevalidate: ({ currentUrl, nextUrl }) => currentUrl.pathname !== nextUrl.pathname,
  },
  { path: "/gallery", element: <Navigate to="/" replace /> },
  { id: "work", path: "/gallery/:slug", element: <GalleryWork />, loader: preloadWork },
  { path: "/import", lazy: later(() => import("./pages/Import")) },
  { path: "/works/:id", lazy: later(() => import("./pages/Work")) },
  { path: "/shared/:token", lazy: later(() => import("./pages/Shared")) },
  { path: "/compare", lazy: later(() => import("./pages/Compare")) },
  { path: "/my", lazy: later(() => import("./pages/My")) },
  { path: "/about", lazy: later(() => import("./pages/About")) },
  { path: "/privacy", lazy: later(() => import("./pages/Privacy")) },
  {
    path: "*",
    element: (
      <PageNotice title="Nothing at this address">
        The link may be mistyped, or the page may have moved.
      </PageNotice>
    ),
  },
];
const broken = (
  <PageNotice title="This page could not be drawn" alert>
    Something in it went wrong on my side, not yours. Reloading may help; the rest of the site
    should still work.
  </PageNotice>
);
// A page that throws while drawing gets this instead of a blank site.
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? broken : this.props.children;
  }
}
export function Shell() {
  const { pathname } = useLocation();
  const how = useNavigationType();
  const main = useRef<HTMLElement>(null);
  const shown = useRef(pathname);
  // A move to another page takes focus to it so a screen reader reads it; the first load, and a redirect such as /gallery to /, leave focus where the browser put it.
  useEffect(() => {
    if (shown.current === pathname) return;
    shown.current = pathname;
    if (how !== "REPLACE") main.current?.focus({ preventScroll: true });
  }, [pathname, how]);
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-30 focus:rounded-md focus:bg-[var(--paper)] focus:px-3 focus:py-2 focus:text-[13px]"
      >
        Skip to the content
      </a>
      {/* The bar and the page fill the screen between them, so the colophon waits just below it and does not jump as a page arrives. */}
      <div className="flex min-h-svh flex-col">
        <Nav />
        {/* Keyed on the path so every page starts fresh, the boundary included, even when only a route's parameter changes. */}
        <main
          id="main"
          ref={main}
          tabIndex={-1}
          className="mx-auto w-full max-w-[72rem] flex-1 px-4 py-6 outline-none"
        >
          <Boundary key={pathname}>
            <Outlet />
          </Boundary>
        </main>
      </div>
      <Colophon />
    </>
  );
}
// Only a data router runs page transitions, and its scroll restoration brings a step back to where it was; it comes first so the wall's own move to a work just left runs after it.
export const routes: RouteObject[] = [
  {
    element: (
      <>
        <ScrollRestoration />
        <Shell />
      </>
    ),
    // A page whose code fails to arrive or that throws while drawing is reported under the bar, not on the router's bare page.
    children: [{ errorElement: broken, children: pages }],
    // A first visit to a page fetched later shows the bar and an empty page while its code arrives.
    HydrateFallback: Shell,
  },
];
export const browserRouter = () =>
  createBrowserRouter(routes, {
    // The first page draws at once with its own loading line; only later moves wait for their files.
    hydrationData: { loaderData: { wall: null, work: null } },
  });
