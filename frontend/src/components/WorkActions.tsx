import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import PosterButton from "../poster/Poster";
import { ActionIcon } from "./icons";
import { boxButton, boxField, textButton } from "../lib/ui";
import { relativeTime } from "../lib/time";
import type { Analysis, Axis, WorkView } from "../types";

// A quiet bordered button with its icon, at least 40 px tall; the chart stays the page's main action.
const BUTTON = `${boxButton} inline-flex items-center gap-1.5`;

export default function WorkActions({
  work,
  analysis,
  axes,
  hasText,
  act,
  onKept,
  onExport,
  onDelete,
}: {
  work: WorkView;
  analysis: Analysis | null;
  axes: Axis[];
  hasText: boolean;
  act: (run: () => Promise<unknown>) => void;
  onKept: () => Promise<unknown>;
  onExport: (withText: boolean) => void;
  onDelete: () => void;
}) {
  const id = work.id;
  const keepable = work.state === "complete" && !work.kept && !!work.expires_at;
  // undefined while the server is asked whether a kept work already has a live link.
  const [share, setShare] = useState<string | null | undefined>(undefined);
  const [said, setSaid] = useState("");
  const field = useRef<HTMLInputElement>(null);
  // The time left is said again every minute while the page stays open.
  const [now, setNow] = useState(Date.now);
  const expires = work.expires_at;
  useEffect(() => {
    if (!expires) return;
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [expires]);
  useEffect(() => {
    if (!work.kept) return;
    api
      .shareLink(id)
      .then((r) => setShare(r.token))
      .catch(() => setShare(null));
  }, [id, work.kept]);
  const url = share ? `${location.origin}/shared/${share}` : "";
  const status = work.kept
    ? share
      ? "Shared: anyone with the link can see the curves and chapter titles, never your text."
      : "Kept on this server until you delete it."
    : `Private${expires ? `, and deleted ${relativeTime(Date.parse(expires), now)}${keepable ? " unless you keep it" : ""}` : ""}.`;
  // Without the Clipboard API (a page served over plain http) the field is selected for the keyboard instead.
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setSaid("Link copied");
    } catch {
      field.current?.select();
      setSaid("Link selected: copy it with your keyboard.");
    }
  };
  return (
    <div className="space-y-2">
      <p className="text-[14px] text-[var(--muted)]">{status}</p>
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        {keepable && (
          <button className={BUTTON} onClick={() => act(() => api.keep(id).then(onKept))}>
            <ActionIcon name="bookmark" />
            Keep
          </button>
        )}
        {work.kept && share === null && (
          <button
            className={BUTTON}
            onClick={() => act(() => api.share(id).then((r) => setShare(r.token)))}
          >
            <ActionIcon name="link" />
            Share link
          </button>
        )}
        {analysis && (
          <button className={BUTTON} onClick={() => onExport(false)}>
            <ActionIcon name="download" />
            Export results
          </button>
        )}
        {analysis && hasText && (
          <button className={BUTTON} onClick={() => onExport(true)}>
            <ActionIcon name="download" />
            Export with text
          </button>
        )}
        {analysis && (
          <PosterButton
            className={BUTTON}
            title={work.title ?? "Untitled"}
            subtitle={work.author ?? ""}
            analysis={analysis}
            axes={axes}
          >
            <ActionIcon name="image" />
          </PosterButton>
        )}
        <button className={`${textButton} ml-auto px-1 text-[var(--bad)]`} onClick={onDelete}>
          Delete
        </button>
      </div>
      {share && (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <input
            ref={field}
            readOnly
            value={url}
            aria-label="Share link"
            onFocus={(e) => e.currentTarget.select()}
            className={`${boxField} min-w-0 flex-1 basis-64`}
          />
          <button className={BUTTON} onClick={() => void copy()}>
            Copy
          </button>
          <button
            className={BUTTON}
            onClick={() => {
              if (confirm("Stop sharing? The link stops working for everyone who has it."))
                act(() =>
                  api.unshare(id).then(() => {
                    setShare(null);
                    setSaid("");
                  }),
                );
            }}
          >
            Stop sharing
          </button>
          <span role="status" className="text-[var(--muted)]">
            {said}
          </span>
        </div>
      )}
    </div>
  );
}
