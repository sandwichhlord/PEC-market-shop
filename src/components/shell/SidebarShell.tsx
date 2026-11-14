"use client";

import { ClipboardList, LayoutDashboard, Menu, Store, UtensilsCrossed, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BrandMark } from "@/components/ui/BrandMark";
import { PORTAL_LOGIN } from "@/lib/portals";
import { LogoutButton } from "./LogoutButton";
import { WarningBanner } from "./WarningBanner";

type SidebarPortal = "shop" | "admin";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

// Navigation per portal; later phases add their pages here.
const NAV: Record<SidebarPortal, NavItem[]> = {
  shop: [
    { href: "/shop", label: "Dashboard", icon: LayoutDashboard },
    { href: "/shop/orders", label: "Orders", icon: ClipboardList },
    { href: "/shop/menu", label: "Menu", icon: UtensilsCrossed },
    { href: "/shop/profile", label: "Shop profile", icon: Store },
  ],
  admin: [{ href: "/admin", label: "Dashboard", icon: LayoutDashboard }],
};

const SUBTITLE: Record<SidebarPortal, string> = { shop: "Shop portal", admin: "Admin" };

const isActive = (pathname: string, href: string, root: string) =>
  href === root ? pathname === root : pathname === href || pathname.startsWith(`${href}/`);

interface SidebarShellProps {
  portal: SidebarPortal;
  /** Shown under the brand: the shop name or the admin's name. */
  heading: string;
  userName: string;
  warning: string | null;
  children: React.ReactNode;
}

/** Shop / admin portal frame: fixed sidebar on wide screens, slide-in drawer behind a menu button on mobile. */
export function SidebarShell({ portal, heading, userName, warning, children }: SidebarShellProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const root = `/${portal}`;

  const sidebar = (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="flex items-start justify-between gap-2">
        <BrandMark href={root} subtitle={SUBTITLE[portal]} />
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close menu"
          className="rounded-md p-2 text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-orange-600 md:hidden"
        >
          <X aria-hidden="true" className="size-5" />
        </button>
      </div>
      <p className="truncate rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800" title={heading}>
        {heading}
      </p>
      <nav aria-label="Portal" className="flex-1">
        <ul className="space-y-1">
          {NAV[portal].map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href, root);
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-orange-600 ${
                    active ? "bg-orange-50 text-orange-700" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <Icon aria-hidden="true" className="size-4" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-t border-slate-200 pt-4">
        <p className="mb-1 truncate px-3 text-xs text-slate-500">Signed in as {userName}</p>
        <LogoutButton loginPath={PORTAL_LOGIN[portal]} className="w-full" />
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh md:pl-64">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-slate-200 bg-white md:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-xl">{sidebar}</aside>
        </div>
      )}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          className="-ml-2 rounded-md p-2 text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-orange-600"
        >
          <Menu aria-hidden="true" className="size-5" />
        </button>
        <span className="truncate font-semibold text-slate-900">{heading}</span>
      </header>
      {warning && <WarningBanner message={warning} />}
      <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8">{children}</main>
    </div>
  );
}
