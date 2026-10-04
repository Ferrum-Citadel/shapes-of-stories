import type { ReactNode } from "react";
import { Link } from "react-router";
import EarlierQuestions from "./EarlierQuestions";
import ShapeCard from "./ShapeCard";
import { link, pageTitle, target } from "../lib/ui";
import { useTitleTravel } from "../lib/motion";
import type { Analysis } from "../types";

// From 1280 px a grid sets the shape block beside the title, the sentence and the controls given as children; below that its wrappers step aside so a phone can reorder their parts.
export default function WorkHeader({
  title,
  author,
  meta,
  questionSet,
  analysis,
  compareTo,
  metaActions,
  actions,
  sentence,
  sentenceId,
  onReplay,
  children,
}: {
  title: string;
  author: string | null;
  meta: string;
  questionSet: string | undefined;
  analysis: Analysis;
  compareTo?: string;
  // Quiet actions set in the meta row after the compare link.
  metaActions?: ReactNode;
  // The work's own action row, under the header.
  actions?: ReactNode;
  sentence: string;
  sentenceId: string;
  onReplay?: () => void;
  children: ReactNode;
}) {
  const missing = analysis.missing_beats.length;
  // The title travels to and from its plate on the wall.
  const travel = useTitleTravel("/");
  return (
    <div className="contents xl:grid xl:grid-cols-[minmax(0,1fr)_260px] xl:items-start xl:gap-x-6">
      <div className="contents xl:flex xl:min-w-0 xl:flex-col xl:gap-3">
        <header>
          <title>{`${title} · Shapes of Stories`}</title>
          <h1 className={pageTitle} style={travel}>
            {title}
          </h1>
          {/* The link is set apart by space, not a dot, so a wrapped line never starts or ends on one. */}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 text-[14px] text-[var(--muted)]">
            {[author, meta].filter(Boolean).join(" · ")}
            {compareTo && (
              <Link
                to={compareTo}
                viewTransition
                className={`${link} ${target} inline-flex items-center`}
              >
                Compare with another work<span aria-hidden>&nbsp;→</span>
              </Link>
            )}
            {metaActions}
          </div>
          <EarlierQuestions version={questionSet} />
          {missing > 0 && (
            <p className="text-[14px] text-[var(--muted)]">
              {`${missing} passage${missing === 1 ? "" : "s"} could not be scored. ${missing === 1 ? "It adds" : "They add"} nothing to the curves, which are drawn from the scored passages alone; any stretch of the text left with no score is hatched on the chart.`}
            </p>
          )}
        </header>
        {actions && <div className="compact:order-3">{actions}</div>}
        <p id={sentenceId} className="serif opsz-14 text-[15px] italic text-[var(--muted)]">
          {sentence}
        </p>
        {children}
      </div>
      <div className="hidden border-l border-[var(--rule)] pl-5 xl:block">
        <ShapeCard
          archetype={analysis.archetype}
          fortuneShape={analysis.bins.fortune.shape}
          onReplay={onReplay}
        />
      </div>
    </div>
  );
}
