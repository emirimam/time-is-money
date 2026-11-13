"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "./AppProvider";

const icons = {
  timer: (
    <path d="M12 8v4l2.5 2.5M9 2h6M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" />
  ),
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  report: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  settings: (
    <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2-1.2L14.5 3h-4l-.4 2.6a7.6 7.6 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7.6 7.6 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z" />
  ),
};

function Icon({ name }: { name: keyof typeof icons }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {icons[name]}
    </svg>
  );
}

export function Nav() {
  const pathname = usePathname();
  const { isAdmin, profile } = useApp();

  const items = [
    { href: "/", label: "Timer", icon: "timer" as const },
    { href: "/entries", label: "Entries", icon: "list" as const },
    ...(isAdmin ? [{ href: "/report", label: "Report", icon: "report" as const }] : []),
    { href: "/settings", label: "Settings", icon: "settings" as const },
  ];

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
      {/* Desktop top bar */}
      <header className="sticky top-0 z-20 hidden border-b border-border bg-background/85 backdrop-blur sm:block">
        <div className="mx-auto flex max-w-3xl items-center gap-6 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-accent text-sm text-white dark:text-black">
              $
            </span>
            Time is Money
          </Link>
          <nav className="flex gap-1">
            {items.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  isActive(i.href) ? "bg-accent-soft font-medium text-accent" : "text-muted hover:text-foreground"
                }`}
              >
                {i.label}
              </Link>
            ))}
          </nav>
          <span className="ml-auto truncate text-sm text-muted">{profile.full_name || profile.email}</span>
        </div>
      </header>

      {/* Mobile bottom bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur sm:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex">
          {items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] ${
                isActive(i.href) ? "font-medium text-accent" : "text-muted"
              }`}
            >
              <Icon name={i.icon} />
              {i.label}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
