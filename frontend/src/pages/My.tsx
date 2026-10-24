import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api, errorMessage } from "../api/client";
import { deleteLocal, importAndSave, listLocal } from "../lib/local";
import type { LocalWork, WorkState, WorkSummary } from "../types";
import { actionPill, focusRing, pageTitle, quiet } from "../lib/ui";
import { relativeTime } from "../lib/time";

const GRID = "grid grid-cols-1 gap-2.5 min-[480px]:grid-cols-2 min-[900px]:grid-cols-3";
const TILE =
  "relative flex h-full flex-col rounded-md border border-[var(--rule)] bg-[var(--paper)] px-2.5 pb-1 pt-2";
const META = "text-[14px] text-[var(--muted)]";
const ACTION = "relative z-10 inline-flex min-h-[40px] items-center text-[13.5px]";
// The title's link stretches over the whole tile, under its action button.
const TITLE =
  "press-soft serif opsz-14 text-[15px] leading-tight after:absolute after:inset-0 after:rounded-md hover:underline hover:decoration-dotted hover:underline-offset-2";

const STATE_WORDS: Record<WorkState, string> = {
  queued: "waiting",
  running: "reading",
  paused: "paused",
  complete: "finished",
  failed: "failed",
  cancelled: "canceled",
};

// A kept work stays; any other leaves the server when it expires.
function fate(w: WorkSummary) {
  if (w.kept) return "kept";
  return w.expires_at ? `deleted ${relativeTime(Date.parse(w.expires_at))}` : "";
}

function ServerTile({ w, onDelete }: { w: WorkSummary; onDelete: () => void }) {
  return (
    <li className={TILE}>
      <Link to={`/works/${w.id}`} className={TITLE} viewTransition>
        {w.title ?? "Untitled"}
      </Link>
      {w.author && <div className={META}>{w.author}</div>}
      <div className={META}>
        {STATE_WORDS[w.state]}
        {w.caption && ` · ${w.caption}`}
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <span className={META}>{fate(w)}</span>
        <button className={`${ACTION} text-[var(--bad)]`} onClick={onDelete}>
          Delete
        </button>
      </div>
    </li>
  );
}

function DeviceTile({ l, onRemove }: { l: LocalWork; onRemove: () => void }) {
  return (
    <li className={`${TILE} border-dashed`}>
      {l.analysis ? (
        <Link to={`/works/${l.id}`} className={TITLE} viewTransition>
          {l.title ?? "Untitled"}
        </Link>
      ) : (
        <div className="serif opsz-14 text-[15px] leading-tight">{l.title ?? "Untitled"}</div>
      )}
      {l.author && <div className={META}>{l.author}</div>}
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <span className={META}>on this device only{l.analysis ? "" : " · no results"}</span>
        <button
          className={`${ACTION} text-[var(--muted)] hover:text-[var(--ink)]`}
          onClick={onRemove}
        >
          Remove
        </button>
      </div>
    </li>
  );
}

export default function My() {
  // Undefined until both sources answer, null when the server could not be reached.
  const [remote, setRemote] = useState<WorkSummary[] | null>();
  const [local, setLocal] = useState<LocalWork[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const load = () => {
    // Each source is caught on its own, so this never rejects.
    void Promise.all([
      api
        .myWorks()
        .then((r) => r.works)
        .catch(() => null),
      listLocal().catch(() => [] as LocalWork[]),
    ]).then(([r, l]) => {
      setRemote(r);
      setLocal(l);
    });
  };
  useEffect(load, []);
  const ids = new Set(remote?.map((w) => w.id));
  const localOnly = local.filter((l) => !ids.has(l.id));
  const remove = (id: string) => {
    if (!confirm("Delete this analysis? This cannot be undone.")) return;
    setErr(null);
    api
      .remove(id)
      .then(() => deleteLocal(id).catch(() => {}))
      .then(load)
      .catch((e) => setErr(errorMessage(e)));
  };
  const removeCopy = (id: string) => {
    if (!confirm("Remove this copy from this browser? It cannot be undone.")) return;
    setErr(null);
    deleteLocal(id)
      .then(load)
      .catch(() => setErr("This browser would not remove its copy just now."));
  };
  return (
    <div className="space-y-5">
      <title>My works · Shapes of Stories</title>
      <h1 className={pageTitle}>My works</h1>
      <p className="text-[13.5px] text-[var(--muted)]">
        Works are tied to this browser. Save your links, or{" "}
        <label
          className={`inline-flex min-h-[40px] cursor-pointer items-center underline decoration-dotted underline-offset-2 hover:decoration-solid ${focusRing}`}
        >
          open a results file
          <input
            type="file"
            className="sr-only"
            accept=".json"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setErr(null);
                importAndSave(f).then(load, (e: Error) => setErr(e.message));
              }
              e.target.value = "";
            }}
          />
        </label>
        .
      </p>
      {err && (
        <p role="alert" className="text-[13px] text-[var(--bad)]">
          {err}
        </p>
      )}
      {remote === null && (
        <p role="alert" className="text-[13px] text-[var(--bad)]">
          The server could not be reached; only this browser's copies are listed.
        </p>
      )}
      {remote?.length === 0 && localOnly.length === 0 && (
        <p className={quiet}>
          Nothing here yet.{" "}
          <Link to="/import" className={actionPill} viewTransition>
            Analyze a book
          </Link>{" "}
          and it will appear here for this browser.
        </p>
      )}
      <ul className={GRID}>
        {remote?.map((w) => (
          <ServerTile key={w.id} w={w} onDelete={() => remove(w.id)} />
        ))}
        {localOnly.map((l) => (
          <DeviceTile key={l.id} l={l} onRemove={() => removeCopy(l.id)} />
        ))}
      </ul>
    </div>
  );
}
