import { COLOPHON, REPO_URL } from "../lib/definitions";
export default function Colophon() {
  return (
    <footer className="hairline serif opsz-14 mx-auto mt-10 max-w-[72rem] px-4 py-4 text-[14px] italic text-[var(--muted)]">
      {COLOPHON}{" "}
      <a
        href={REPO_URL}
        className="relative underline decoration-dotted underline-offset-2 hover:decoration-solid after:absolute after:-inset-x-1 after:-inset-y-3.5 after:content-['']"
      >
        Source on GitHub
      </a>
      .
    </footer>
  );
}
