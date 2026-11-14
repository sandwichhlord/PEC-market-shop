"use client";

import { Bell, ClipboardList, Store, UserRound, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CartLink } from "@/components/cart/CartLink";
import { NotificationBell, UnreadBadge } from "@/components/notifications/NotificationBell";
import { NotificationsProvider, useNotifications } from "@/components/notifications/NotificationsProvider";
import { BrandMark } from "@/components/ui/BrandMark";
import { WarningBanner } from "./WarningBanner";

interface Tab {
  href: string;
  label: string;
  icon: LucideIcon;
}

const TABS: Tab[] = [
  { href: "/shops", label: "Shops", icon: Store },
  { href: "/orders", label: "Orders", icon: ClipboardList },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/account", label: "Account", icon: UserRound },
];

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/** Customer portal frame: top bar (with inline tabs on wide screens) and a bottom tab bar on mobile. */
export function CustomerShell({ warning, children }: { warning: string | null; children: React.ReactNode }) {
  return (
    <NotificationsProvider>
      <CustomerFrame warning={warning}>{children}</CustomerFrame>
    </NotificationsProvider>
  );
}

function CustomerFrame({ warning, children }: { warning: string | null; children: React.ReactNode }) {
  const pathname = usePathname();
  const { unreadCount } = useNotifications();
  const tabLabel = (href: string, label: string) =>
    href === "/notifications" && unreadCount > 0 ? `${label}, ${unreadCount} unread` : undefined;
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <BrandMark href="/shops" />
          <div className="flex items-center gap-2">
            <nav aria-label="Main" className="hidden md:block">
              <ul className="flex gap-1">
                {TABS.map(({ href, label, icon: Icon }) => {
                  const active = isActive(pathname, href);
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        aria-current={active ? "page" : undefined}
                        aria-label={tabLabel(href, label)}
                        className={`flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-orange-600 ${
                          active ? "bg-orange-50 text-orange-700" : "text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        <Icon aria-hidden="true" className="size-4" />
                        {label}
                        {href === "/notifications" && <UnreadBadge count={unreadCount} />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <NotificationBell allHref="/notifications" />
            <CartLink active={isActive(pathname, "/cart")} />
          </div>
        </div>
      </header>
      {warning && <WarningBanner message={warning} />}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-4 pb-24 md:pb-8">{children}</main>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="grid grid-cols-4">
          {TABS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  aria-label={tabLabel(href, label)}
                  className={`relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-orange-600 ${
                    active ? "text-orange-700" : "text-slate-500"
                  }`}
                >
                  <Icon aria-hidden="true" className="size-5" />
                  {label}
                  {href === "/notifications" && <UnreadBadge count={unreadCount} className="absolute top-1 left-1/2 ml-1" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
