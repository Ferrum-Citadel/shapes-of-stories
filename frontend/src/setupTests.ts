import "@testing-library/jest-dom/vitest";
import { format } from "node:util";
import { clearGalleryCache } from "./lib/gallery";
import { setKeptMine } from "./lib/local";
import { stubMedia } from "./__tests__/fixtures";

// jsdom has no Web Animations or media queries, so each test starts with stand-ins that play nothing and match nothing; it also starts with empty storage.
beforeEach(() => {
  Element.prototype.animate = function () {
    return { cancel() {}, onfinish: null } as unknown as Animation;
  };
  stubMedia();
  // A warning React or the router prints fails the test that caused it.
  vi.spyOn(console, "error").mockImplementation((...args) => {
    throw new Error(format(...args));
  });
  localStorage.clear();
  sessionStorage.clear();
});

// Each test serves its own gallery files and starts on real time.
afterEach(() => {
  clearGalleryCache();
  setKeptMine(undefined);
  vi.useRealTimers();
});
