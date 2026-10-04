import { createStore, del, get, keys, set } from "idb-keyval";
import type { GalleryEntry, LocalWork } from "../types";
const store = createStore("sos", "works");

// A saved work with results hangs on the wall as a gallery work does; its slug is its id.
export const asEntry = (w: LocalWork): GalleryEntry[] =>
  w.analysis
    ? [
        {
          slug: w.id,
          title: w.title ?? "Untitled",
          author: w.author ?? "",
          word_count: w.structure.word_count,
          content_hash: w.content_hash ?? "",
          question_set_version: w.question_set_version ?? "",
          model_id: w.model_id ?? "",
          archetype: w.analysis.archetype,
          sparkline: w.analysis.bins.fortune.shape,
        },
      ]
    : [];

// The wall's last list of the reader's works, kept for the visit; any change to the store drops it, so the wall's first frame is never stale.
let listed: GalleryEntry[] | undefined;
export const keptMine = () => listed;
export const setKeptMine = (mine: GalleryEntry[] | undefined) => {
  listed = mine;
};

// Async so that a browser refusing to open the store (Firefox with site data blocked throws at once) rejects instead of throwing.
export const saveLocal = async (w: LocalWork) => {
  listed = undefined;
  return set(w.id, w, store);
};
export const loadLocal = async (id: string) => get<LocalWork>(id, store);
export const deleteLocal = async (id: string) => {
  listed = undefined;
  return del(id, store);
};
export async function listLocal(): Promise<LocalWork[]> {
  const ks = await keys<string>(store);
  const all = (await Promise.all(ks.map((k) => get<LocalWork>(k, store)))).filter(
    (x): x is LocalWork => !!x,
  );
  return all.sort((a, b) => b.savedAt - a.savedAt);
}
const sha256 = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
// The newest saved work whose text has this hash, finished or not; an older copy without a hash is hashed from its text, where crypto.subtle allows, and keeps it if still unhashed.
export async function analyzedBefore(hash: string): Promise<LocalWork | undefined> {
  const hashing = typeof crypto !== "undefined" && !!crypto.subtle;
  for (const w of await listLocal()) {
    if (!w.content_hash && w.text && hashing) {
      w.content_hash = await sha256(w.text);
      const now = await loadLocal(w.id).catch(() => undefined);
      if (now && !now.content_hash)
        await saveLocal({ ...now, content_hash: w.content_hash }).catch(() => {});
    }
    if (w.content_hash === hash) return w;
  }
}
export function exportFile(w: LocalWork, includeText: boolean): Blob {
  const payload = {
    version: 1,
    id: w.id,
    title: w.title,
    author: w.author,
    structure: w.structure,
    analysis: w.analysis,
    answers: w.answers,
    question_set_version: w.question_set_version,
    model_id: w.model_id,
    cost_usd: w.cost_usd,
    content_hash: w.content_hash,
    text: includeText ? w.text : "",
  };
  return new Blob([JSON.stringify(payload)], { type: "application/json" });
}
export async function importFile(file: File): Promise<LocalWork> {
  const j = JSON.parse(await file.text()) as Partial<LocalWork> & { version?: number };
  // The id becomes a store key, a route segment and a storage key, so it is held to one plain form.
  if (
    j.version !== 1 ||
    !Array.isArray(j.structure?.beats) ||
    !j.structure.beats.length ||
    !Array.isArray(j.structure.chapters) ||
    (j.id != null && !(typeof j.id === "string" && /^[\w-]{1,64}$/.test(j.id)))
  )
    throw new Error("not a .shapes.json file");
  return {
    id: j.id ?? `file-${Date.now()}`,
    title: j.title ?? null,
    author: j.author ?? null,
    text: j.text ?? "",
    structure: j.structure,
    analysis: j.analysis ?? null,
    answers: j.answers ?? {},
    savedAt: Date.now(),
    question_set_version: j.question_set_version,
    model_id: j.model_id,
    cost_usd: j.cost_usd,
    content_hash: j.content_hash,
  };
}
// An import fails with one of these as its message, so a caller can show it as it is.
const NOT_A_RESULTS_FILE = "This file could not be opened as a results file.";
const NOT_STORED = "The file is fine, but this browser would not store it.";
const TOO_LARGE = "Results files must be under 20 MB.";
const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
// A file never replaces a work already in this browser, whatever it holds.
export async function importAndSave(file: File): Promise<LocalWork> {
  if (file.size > MAX_IMPORT_BYTES) throw new Error(TOO_LARGE);
  const w = await importFile(file).catch(() => {
    throw new Error(NOT_A_RESULTS_FILE);
  });
  const existing = await loadLocal(w.id).catch(() => {
    throw new Error(NOT_STORED);
  });
  if (existing)
    throw new Error(
      `This file would replace "${existing.title ?? "Untitled"}", already in this browser. Delete that work first to open the file.`,
    );
  await saveLocal(w).catch(() => {
    throw new Error(NOT_STORED);
  });
  return w;
}
