import { Link, NavLink } from "react-router";
import { useTheme } from "../lib/theme";
import { actionPill } from "../lib/ui";
import { Icon } from "./icons";
const LINKS = [
  ["/", "Gallery"],
  ["/compare", "Compare"],
  ["/my", "My works"],
  ["/about", "About"],
] as const;
const ICON = { system: "auto", light: "sun", dark: "moon" } as const;
const HIT =
  "relative inline-flex min-h-[40px] items-center whitespace-nowrap after:absolute after:inset-y-0 after:-inset-x-1 after:content-['']";
export default function Nav() {
  const { choice, cycle } = useTheme();
  return (
    <header
      className="mx-auto flex w-full max-w-[72rem] flex-wrap items-baseline gap-x-6 gap-y-2 border-b border-[var(--rule)] px-4 py-3 max-sm:gap-x-4"
      // Named apart from the page, the bar holds still while the page under it changes.
      style={{ viewTransitionName: "nav" }}
    >
      <Link
        to="/"
        viewTransition
        className="serif opsz-40 mr-auto inline-flex min-h-[40px] items-center text-[18px] font-medium"
      >
        Shapes of Stories
      </Link>
      {/* On a phone the links take their own row under the title, the pill and the theme button. */}
      <nav
        aria-label="Site"
        className="flex flex-wrap gap-x-4 text-[13px] max-sm:order-1 max-sm:basis-full max-sm:gap-x-3"
      >
        {LINKS.map(([to, label]) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            viewTransition
            className={({ isActive }) =>
              `${HIT} ${isActive ? "font-medium text-[var(--ink)]" : "text-[var(--muted)] hover:text-[var(--ink)]"}`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <NavLink to="/import" viewTransition className={`${actionPill} self-center sm:-ml-2`}>
        Analyze a book<span aria-hidden>{"\u00a0→"}</span>
      </NavLink>
      <button
        type="button"
        onClick={cycle}
        aria-label={`Theme: ${choice}`}
        className="-mx-3 inline-flex size-10 items-center justify-center self-center text-[var(--muted)] hover:text-[var(--ink)]"
      >
        <Icon name={ICON[choice]} />
      </button>
    </header>
  );
}
