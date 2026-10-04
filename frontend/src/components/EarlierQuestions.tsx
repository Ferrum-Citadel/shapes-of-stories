import { QUESTION_SET } from "../lib/definitions";

// A copy saved before results carried their question set has none, and counts as earlier.
export default function EarlierQuestions({ version }: { version: string | undefined }) {
  if (version === QUESTION_SET) return null;
  return (
    <p className="text-[14px] text-[var(--muted)]">
      Scored with an earlier set of questions{version && ` (${version})`}; uploading the text again
      scores it with the current set.
    </p>
  );
}
