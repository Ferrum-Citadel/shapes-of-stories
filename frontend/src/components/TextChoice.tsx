import { useId } from "react";
import { focusRingOffset, note } from "../lib/ui";

const TEXT_CHOICES = [
  {
    keep: true,
    title: "Save the text in this browser",
    note: "The passages open beside the chart; the server never keeps them.",
  },
  {
    keep: false,
    title: "Discard the text",
    note: "Only the scores are saved; the passages will not open beside the chart.",
  },
];

export default function TextChoice({
  keep,
  onKeep,
}: {
  keep: boolean;
  onKeep: (keep: boolean) => void;
}) {
  const name = useId();
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="label pb-2">After the analysis</legend>
      {TEXT_CHOICES.map((c) => (
        <label
          key={c.title}
          className={`group flex min-h-[40px] cursor-pointer items-start gap-3 rounded-md border border-[var(--rule)] px-3 py-2 has-[:checked]:border-[var(--ink)] ${focusRingOffset}`}
        >
          <input
            type="radio"
            name={name}
            className="sr-only"
            checked={keep === c.keep}
            onChange={() => onKeep(c.keep)}
          />
          <span
            aria-hidden
            className="mt-1 size-3.5 shrink-0 rounded-full border border-[var(--muted)] group-has-[:checked]:border-[var(--ink)] group-has-[:checked]:bg-[var(--ink)] group-has-[:checked]:shadow-[inset_0_0_0_2px_var(--paper)]"
          />
          <span>
            <span className="block text-[14px]">{c.title}</span>
            <span className={`block ${note}`}>{c.note}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
