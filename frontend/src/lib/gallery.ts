import { useEffect, useState } from "react";
import type { GalleryEntry } from "../types";
import { getJson } from "../api/client";
import { FAMILY_ORDER, SHAPE_INFO, isFamily, type Family } from "./definitions";

export const INDEX = "/gallery/index.json";
// A gallery file is fetched once a visit and kept, so a page whose files are in hand draws whole on its first frame.
const galleryFiles = new Map<string, Promise<unknown>>();
const keptFiles = new Map<string, unknown>();
export function galleryFile<T>(path: string): Promise<T> {
  let p = galleryFiles.get(path);
  if (!p) {
    p = getJson<T>(path).then((v) => {
      keptFiles.set(path, v);
      return v;
    });
    galleryFiles.set(path, p);
  }
  return p as Promise<T>;
}
export const keptFile = <T>(path: string) => keptFiles.get(path) as T | undefined;
// A failure stays until the page that reports it lets it go, so a page reached through a preload reuses its answer and the next visit asks again.
export const forgetFile = (path: string) => galleryFiles.delete(path);
export function clearGalleryCache() {
  galleryFiles.clear();
  keptFiles.clear();
}

// A gallery file fetched only once it is first wanted, such as a work's per-passage answers, which most visits never open.
export function useFileOnDemand<T>(path: string | undefined, wanted: boolean) {
  const [file, setFile] = useState<{ value: T | null; failed: boolean }>({
    value: null,
    failed: false,
  });
  useEffect(() => {
    if (!path || !wanted) return;
    let live = true;
    galleryFile<T>(path).then(
      (value) => {
        if (live) setFile({ value, failed: false });
      },
      () => {
        forgetFile(path);
        if (live) setFile({ value: null, failed: true });
      },
    );
    return () => {
      live = false;
    };
  }, [path, wanted]);
  return file;
}

// A move waits at most 300 ms for its files: a quick one arrives whole so its title can travel, a slow one changes page at once and shows its own loading line.
const settled = () => null;
const briefly = (load: Promise<unknown>) =>
  Promise.race([load.then(settled, settled), new Promise<null>((r) => setTimeout(r, 300, null))]);
export const preloadWall = () => briefly(galleryFile(INDEX));
export const preloadWork = ({ params }: { params: { slug?: string } }) =>
  briefly(Promise.all([galleryFile(INDEX), galleryFile(`/gallery/${params.slug}.json`)]));

export function familyOf({ archetype: { state, shape } }: GalleryEntry): Family {
  return state !== "none" && isFamily(shape) ? shape : "none";
}

const rank = (e: GalleryEntry) => (e.archetype.state === "named" ? 0 : 1);

export function groupByFamily(entries: GalleryEntry[]) {
  return FAMILY_ORDER.map((key) => {
    const { name, description, quote } = SHAPE_INFO[key];
    const items = entries
      .filter((e) => familyOf(e) === key)
      .sort((a, b) => rank(a) - rank(b) || b.archetype.r - a.archetype.r);
    return { key, name, description, quote, items };
  }).filter((f) => f.items.length);
}

// Accents are dropped on both sides, so "bronte" finds Brontë.
export const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const bare = (t: string) => t.replace(/^(the|a|an)\s+/i, "").toLowerCase();
export function byTitle(entries: GalleryEntry[]) {
  return [...entries].sort((a, b) => bare(a.title).localeCompare(bare(b.title), "en"));
}

// The works on either side of one in its family, in title order; a work not in the index has none.
export function neighbors(entries: GalleryEntry[], slug: string) {
  const me = entries.find((e) => e.slug === slug);
  if (!me) return {};
  const room = byTitle(entries.filter((e) => familyOf(e) === familyOf(me)));
  const i = room.indexOf(me);
  return { prev: room[i - 1], next: room[i + 1] };
}
