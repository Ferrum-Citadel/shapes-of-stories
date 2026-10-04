import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { api } from "../api/client";
import { INDEX, forgetFile, galleryFile } from "../lib/gallery";
import { importAndSave, listLocal, loadLocal } from "../lib/local";
import Comparison, { type Side } from "../components/Comparison";
import WorkPicker, { type Choice } from "../components/WorkPicker";
import type { Axis, GalleryEntry, GalleryWork, LocalWork } from "../types";
import { pageTitle, quiet } from "../lib/ui";
async function load(ref: string): Promise<Side | null> {
  const [kind, id] = ref.split(":");
  if (kind === "gallery") {
    const path = `/gallery/${id}.json`;
    // A failure is let go at once, so choosing the work again asks again.
    const w = await galleryFile<GalleryWork>(path).catch((e) => {
      forgetFile(path);
      throw e;
    });
    return {
      label: w.work.title,
      analysis: w.analysis,
      structure: w.structure,
      questionSet: w.work.question_set_version,
    };
  }
  if (kind === "work") {
    const local = await loadLocal(id).catch(() => undefined);
    if (local?.analysis)
      return {
        label: local.title ?? id,
        analysis: local.analysis,
        structure: local.structure,
        questionSet: local.question_set_version,
      };
    const w = await api.getWork(id);
    return w.analysis
      ? {
          label: w.title ?? id,
          analysis: w.analysis,
          structure: w.structure,
          questionSet: w.question_set_version,
        }
      : null;
  }
  return null;
}
// Loads one side whenever its choice changes and drops answers for an earlier choice: null means nothing chosen or still loading, and { side: null } means the choice failed.
function useSide(ref: string | null) {
  const [got, setGot] = useState<{ ref: string; side: Side | null } | null>(null);
  useEffect(() => {
    if (!ref) return;
    let live = true;
    void load(ref)
      .catch(() => null)
      .then((side) => {
        if (live) setGot({ ref, side });
      });
    return () => {
      live = false;
    };
  }, [ref]);
  return got?.ref === ref ? got : null;
}
function Prompt({ loading }: { loading: boolean }) {
  if (loading)
    return (
      <p role="status" className={quiet}>
        Loading…
      </p>
    );
  return <p className={quiet}>Pick two works to compare, or open a results file you downloaded.</p>;
}

// A work of the reader's own can be chosen once it has results.
const ownChoice = (m: LocalWork): Choice[] =>
  m.analysis
    ? [
        {
          ref: `work:${m.id}`,
          title: m.title ?? m.id,
          author: m.author ?? "",
          note: m.analysis.archetype.caption || "your work",
        },
      ]
    : [];

export default function Compare() {
  const [params, setParams] = useSearchParams();
  const sides = { a: useSide(params.get("a")), b: useSide(params.get("b")) };
  const a = sides.a?.side ?? null;
  const b = sides.b?.side ?? null;
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [axis, setAxis] = useState<Axis>("fortune");
  const [choices, setChoices] = useState<Choice[]>([]);
  // Each source is caught on its own, so a blocked store still leaves the gallery to choose from.
  useEffect(() => {
    void (async () => {
      const [g, mine] = await Promise.all([
        galleryFile<GalleryEntry[]>(INDEX).catch(() => {
          forgetFile(INDEX);
          return [];
        }),
        listLocal().catch(() => []),
      ]);
      setChoices([
        ...g.map((x) => ({ ref: `gallery:${x.slug}`, title: x.title, author: x.author, entry: x })),
        ...mine.flatMap(ownChoice),
      ]);
    })();
  }, []);
  const set = (k: "a" | "b", v: string) => {
    const p = new URLSearchParams(params);
    p.set(k, v);
    // A pick changes the page's address, not the page, so the view stays where it is.
    setParams(p, { preventScrollReset: true });
  };
  const openFile = (k: "a" | "b") => (f: File) => {
    setFileErr(null);
    importAndSave(f).then(
      (w) => {
        // The list was read when the page opened, so the work just opened joins it here.
        setChoices((cs) => [...cs.filter((c) => c.ref !== `work:${w.id}`), ...ownChoice(w)]);
        set(k, `work:${w.id}`);
      },
      (e: Error) => setFileErr(e.message),
    );
  };
  const loading = (["a", "b"] as const).some((k) => params.get(k) && !sides[k]);
  return (
    <div className="max-w-[60rem] space-y-6">
      <title>Compare two works · Shapes of Stories</title>
      <h1 className={pageTitle}>Compare two works</h1>
      <div className="space-y-2">
        <div className="grid items-end gap-x-6 gap-y-3 sm:grid-cols-2">
          {(["a", "b"] as const).map((k) => (
            <div key={k}>
              <WorkPicker
                label={k === "a" ? "First work" : "Second work"}
                current={
                  sides[k]?.side?.label ?? choices.find((c) => c.ref === params.get(k))?.title ?? ""
                }
                choices={choices}
                onChange={(v) => set(k, v)}
                onFile={openFile(k)}
              />
              {sides[k]?.side === null && (
                <p role="alert" className="mt-1 text-[13px] text-[var(--bad)]">
                  This work could not be loaded.
                </p>
              )}
            </div>
          ))}
        </div>
        {fileErr && (
          <p role="alert" className="text-[13px] text-[var(--bad)]">
            {fileErr}
          </p>
        )}
      </div>
      {a && b ? (
        <Comparison a={a} b={b} axis={axis} onAxis={setAxis} />
      ) : (
        <Prompt loading={loading} />
      )}
    </div>
  );
}
