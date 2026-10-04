import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { api, ApiError, type SharedWork } from "../api/client";
import WorkViewer from "../components/WorkViewer";
import { metaOf } from "../lib/definitions";
import { quiet } from "../lib/ui";
import PageNotice from "../components/PageNotice";

// Share tokens are URL-safe base64; anything else is no link at all and is never sent to the server.
const TOKEN = /^[\w-]{16,64}$/;
const QUIET_PILL =
  "inline-flex min-h-[40px] items-center whitespace-nowrap rounded-full border border-[var(--rule)] px-3 text-[13px] text-[var(--muted)] hover:border-[var(--ink)] hover:text-[var(--ink)]";

export default function Shared() {
  const { token = "" } = useParams();
  const valid = TOKEN.test(token);
  const [w, setW] = useState<SharedWork | null>(null);
  const [err, setErr] = useState<"gone" | "failed" | null>(null);
  useEffect(() => {
    if (!valid) return;
    api
      .shared(token)
      .then(setW)
      .catch((e: unknown) => setErr(e instanceof ApiError && e.status === 404 ? "gone" : "failed"));
  }, [token, valid]);
  if (!valid)
    return (
      <PageNotice title="Nothing at this link" alert>
        This is not a share link. Check that it was copied whole.
      </PageNotice>
    );
  if (err === "gone")
    return (
      <PageNotice title="This link no longer works" alert>
        Whoever shared it has stopped sharing it, or the analysis was deleted.
      </PageNotice>
    );
  if (err)
    return (
      <PageNotice title="Could not load this link" alert>
        The server did not answer. Try again in a moment.
      </PageNotice>
    );
  if (!w)
    return (
      <p role="status" className={quiet}>
        Loading the work…
      </p>
    );
  if (!w.analysis)
    return <p role="status">This analysis has not finished yet. Try the link again in a while.</p>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-[14px] text-[var(--muted)]">
          Shared view: curves, events and chapter titles. The text stays with whoever analyzed it.
        </p>
        <Link to="/import" viewTransition className={QUIET_PILL}>
          Analyze your own book
        </Link>
      </div>
      <WorkViewer
        title={w.title ?? "Untitled"}
        author={w.author}
        meta={metaOf(w)}
        questionSet={w.question_set_version}
        analysis={w.analysis}
        structure={w.structure}
        text=""
        seenKey="sos.seen.shared"
        shared
      />
    </div>
  );
}
