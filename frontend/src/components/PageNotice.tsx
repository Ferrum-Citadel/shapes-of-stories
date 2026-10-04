import type { ReactNode } from "react";
import { Link } from "react-router";
import { link, pageTitle } from "../lib/ui";

export default function PageNotice({
  title,
  alert,
  children,
}: {
  title: string;
  alert?: boolean;
  children: ReactNode;
}) {
  return (
    <div role={alert ? "alert" : undefined} className="space-y-2">
      <title>{`${title} · Shapes of Stories`}</title>
      <h1 className={pageTitle}>{title}</h1>
      <p className="serif opsz-14 text-[15px]">{children}</p>
      <Link
        to="/"
        viewTransition
        className={`inline-flex min-h-[40px] items-center text-[13.5px] ${link}`}
      >
        Back to the gallery
      </Link>
    </div>
  );
}
