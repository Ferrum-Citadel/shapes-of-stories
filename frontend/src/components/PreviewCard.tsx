import { useEffect, useRef } from "react";
import { Link } from "react-router";
import type { GalleryEntry, LocalWork, Preview } from "../types";
import { actionPill, link, note } from "../lib/ui";

const duration = (seconds: number) =>
  seconds < 90 ? `${seconds} seconds` : `${Math.round(seconds / 60)} minutes`;

export default function PreviewCard({
  preview,
  gallery,
  seen,
  stopped,
}: {
  preview: Preview;
  gallery: GalleryEntry[];
  seen?: LocalWork;
  stopped: boolean;
}) {
  const match = gallery.find((g) => g.content_hash === preview.content_hash);
  const pill = useRef<HTMLAnchorElement>(null);
  // Analyze unmounts when it stops at this card, so its focus moves to the way on rather than dropping to the page.
  useEffect(() => {
    if (stopped) pill.current?.focus();
  }, [stopped]);
  const rows: [string, string | null][] = [
    ["Author", preview.author],
    ["Words", preview.word_count.toLocaleString()],
    ["Chapters detected", String(preview.chapters.length)],
    ["Skipped parts", preview.stripped.map((s) => `${s.label} (${s.word_count} words)`).join(", ")],
    ["Kind", `${preview.preset} (${preview.format.toUpperCase()})`],
    ["Language", preview.english ? "English" : "Not English"],
  ];
  const { beats, cost_usd, seconds } = preview.estimate;
  const estimate = `About ${beats} passages, roughly $${cost_usd.toFixed(2)} of your TypeSafe usage, about ${duration(seconds)}.`;
  return (
    <div className="rounded-lg border border-[var(--rule)] bg-[var(--paper)] p-4">
      <h2 className="serif opsz-40 text-[22px] font-medium leading-tight">
        {preview.title ?? "Untitled"}
      </h2>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-[13px]">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-[var(--muted)]">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>
      {preview.warnings.map((w) => (
        <p key={w} className="mt-2 text-[13px]" style={{ color: "var(--warn)" }}>
          {w.replaceAll("_", " ")}
        </p>
      ))}
      <p className="hairline serif opsz-14 mt-3 pt-3 text-[16px] italic">{estimate}</p>
      {/* A text with an analysis already gets a way to it in place of Analyze; the reader's own copy comes first. */}
      {seen ? (
        <div className="mt-3 space-y-2">
          <p className="text-[14px]">
            {seen.analysis
              ? "You analyzed this text on"
              : "You started an analysis of this text on"}{" "}
            {new Date(seen.savedAt).toLocaleDateString(undefined, { dateStyle: "long" })}.
          </p>
          {/* A run without results yet still opens its work page, which shows its progress or lets it resume. */}
          <Link ref={pill} className={actionPill} to={`/works/${seen.id}`} viewTransition>
            {seen.analysis ? "Open your analysis →" : "Open it →"}
          </Link>
          <p className={note}>
            To analyze it afresh, delete this copy in{" "}
            <Link className={link} to="/my" viewTransition>
              My works
            </Link>{" "}
            first.
          </p>
        </div>
      ) : (
        match && (
          <div className="mt-3 space-y-2">
            <p className="text-[14px]">This book already hangs in the gallery.</p>
            <Link ref={pill} className={actionPill} to={`/gallery/${match.slug}`} viewTransition>
              Open it in the gallery →
            </Link>
          </div>
        )
      )}
    </div>
  );
}
