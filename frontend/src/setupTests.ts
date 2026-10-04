import "@testing-library/jest-dom/vitest";
import { format } from "node:util";
import { clearGalleryCache } from "./lib/gallery";
import { setKeptMine } from "./lib/local";
import { objectUrls, stubMedia } from "./__tests__/fixtures";

// jsdom has no Web Animations, media queries, scrolling or object URLs, so each test starts with stand-ins that play nothing, match nothing, move nothing and keep each blob in objectUrls; it also starts with empty storage.
beforeEach(() => {
  window.scrollTo = window.scrollBy = () => {};
  let made = 0;
  URL.createObjectURL = (b: Blob) => {
    const url = `blob:test-${made++}`;
    objectUrls.set(url, b);
    return url;
  };
  URL.revokeObjectURL = (url: string) => void objectUrls.delete(url);
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
  objectUrls.clear();
  vi.useRealTimers();
});
