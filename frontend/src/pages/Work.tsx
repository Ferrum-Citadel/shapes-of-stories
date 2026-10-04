import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { api, errorMessage, getKey } from "../api/client";
import { deleteLocal, exportFile } from "../lib/local";
import { useWork } from "./useWork";
import WorkViewer from "../components/WorkViewer";
import ArcChartLive from "../chart/ArcChartLive";
import { metaOf } from "../lib/definitions";
import WorkActions from "../components/WorkActions";
import type { Axis } from "../types";
import { field, pageTitle, quiet, textButton } from "../lib/ui";
import PageNotice from "../components/PageNotice";
import { downloadBlob, sanitizeFilename } from "../lib/download";
import { useLeaveMark } from "../lib/motion";

const FAILURES: Record<string, string> = {
  key_rejected: "Your key was rejected; results so far are kept.",
  rate_limited: "TypeSafe kept rate-limiting for ten minutes; results so far are kept.",
  unscored_passages:
    "Some passages could not be scored. Resume tries them once more and, if they fail again, finishes without them.",
};
// Any other failure, such as `internal` or `text_or_key_missing`, went wrong on the server's side.
const FAILED = "Something went wrong on the server; Resume or start again.";

export default function Work() {
  const { id = "" } = useParams();
  // A step back to the wall centers this work's plate among the reader's own.
  useLeaveMark(`/works/${id}`);
  const w = useWork(id);
  const nav = useNavigate();
  const [resumeKey, setResumeKey] = useState(() => getKey() ?? "");
  const [opErr, setOpErr] = useState<string | null>(null);
  // Each action clears the last one's failure and reports its own.
  const act = (run: () => Promise<unknown>) => {
    setOpErr(null);
    run().catch((e: unknown) => setOpErr(errorMessage(e)));
  };
  // A results file opened here, or a work the server has since let go, can still be read from this browser's copy.
  const l = w.local;
  if (w.error === "not_found" && !w.work && l?.analysis)
    return (
      <WorkViewer
        title={l.title ?? "Untitled"}
        author={l.author}
        // The device's copy is the reader's own, so it shows its cost.
        meta={metaOf(
          {
            word_count: l.structure.word_count,
            structure: l.structure,
            model_id: l.model_id,
            question_set_version: l.question_set_version,
            cost_usd: l.cost_usd,
          },
          true,
        )}
        questionSet={l.question_set_version}
        analysis={l.analysis}
        structure={l.structure}
        text={l.text}
        textDiscarded={!l.text}
        answers={l.answers}
        actions={() => (
          <p className="text-[14px] text-[var(--muted)]">This copy lives only in this browser.</p>
        )}
        seenKey={`sos.seen.work.${id}`}
        compareTo={`/compare?a=work:${id}`}
      />
    );
  if (w.error && !w.work)
    return (
      <PageNotice title="Could not load this work" alert>
        It may have expired, been deleted, or not have loaded. Try again in a moment.
      </PageNotice>
    );
  if (!w.work)
    return (
      <p role="status" className={quiet}>
        Loading the work…
      </p>
    );
  const work = w.work;
  const s = work.structure;
  const text = w.local?.text ?? "";
  const analysis = w.analysis;
  const title = work.title ?? "Untitled";
  const live = w.state === "queued" || w.state === "running" || w.state === "paused";
  // A run still waiting for its model shows an ellipsis in its place.
  const meta = metaOf({ ...work, model_id: work.model_id ?? "…" }, true);
  const exportAs = (withText: boolean) =>
    downloadBlob(
      exportFile(
        {
          id,
          title: work.title,
          author: work.author,
          text,
          structure: s,
          analysis,
          answers: w.answers,
          savedAt: Date.now(),
          question_set_version: work.question_set_version,
          model_id: work.model_id,
          content_hash: w.local?.content_hash,
        },
        withText,
      ),
      `${sanitizeFilename(work.title ?? "", "work")}.shapes.json`,
    );
  const failure = w.state === "failed" && (
    <div
      role="alert"
      className="rounded-lg border border-[var(--rule)] bg-[var(--paper)] p-3 text-[13px] space-y-2"
    >
      <p className="text-[var(--bad)]" data-code={w.error}>
        {w.error && Object.hasOwn(FAILURES, w.error) ? FAILURES[w.error] : FAILED}
      </p>
      <div className="flex gap-2">
        <input
          type="password"
          className={field}
          value={resumeKey}
          onChange={(e) => setResumeKey(e.target.value)}
          placeholder="TypeSafe key"
          aria-label="TypeSafe key"
        />
        <button
          className={textButton}
          onClick={() => act(() => api.resume(id, resumeKey).then(w.refresh))}
        >
          Resume
        </button>
      </div>
    </div>
  );
  // The poster draws the layers selected in the viewer.
  const actions = (axes: Axis[]) => (
    <div className="space-y-3">
      {opErr && (
        <p role="alert" className="text-[13px] text-[var(--bad)]">
          {opErr}
        </p>
      )}
      {failure}
      <WorkActions
        work={work}
        analysis={analysis}
        axes={axes}
        hasText={!!text}
        act={act}
        onKept={w.refresh}
        onExport={exportAs}
        onDelete={() => {
          if (confirm("Delete this analysis? This cannot be undone."))
            act(() =>
              api
                .remove(id)
                .then(() => deleteLocal(id).catch(() => {}))
                .then(() => nav("/my", { viewTransition: true })),
            );
        }}
      />
    </div>
  );
  if (analysis)
    return (
      <WorkViewer
        title={title}
        author={work.author}
        meta={meta}
        questionSet={work.question_set_version}
        analysis={analysis}
        structure={s}
        text={text}
        textDiscarded={!!w.local && !w.local.text}
        answers={w.answers}
        actions={actions}
        seenKey={`sos.seen.work.${id}`}
        compareTo={`/compare?a=work:${id}`}
      />
    );
  return (
    <div className="space-y-4">
      <header>
        <title>{`${title} · Shapes of Stories`}</title>
        <h1 className={pageTitle}>{title}</h1>
        <p className="mt-2 text-[14px] text-[var(--muted)]">
          {[work.author, meta].filter(Boolean).join(" · ")}
        </p>
      </header>
      {actions(["fortune"])}
      {live && (
        <ArcChartLive
          answers={w.answers}
          structure={s}
          state={w.state}
          done={w.done}
          total={w.total}
          secondsLeft={w.secondsLeft}
          queuePosition={w.queuePosition}
          onCancel={() => act(() => api.cancel(id).then(w.refresh))}
        />
      )}
    </div>
  );
}
