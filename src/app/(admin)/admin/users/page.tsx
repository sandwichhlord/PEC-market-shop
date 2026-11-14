import { Search, Users } from "lucide-react";
import type { Metadata } from "next";
import { AccountStatusPill } from "@/components/admin/AccountStatusPill";
import { ModerationActions } from "@/components/admin/ModerationActions";
import { buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatDate } from "@/lib/datetime";
import { ROLE_LABEL_SHORT } from "@/lib/reports";
import { userListSchema, type UserListQuery } from "@/lib/validation/admin";
import { listUsers } from "@/server/admin/directory";

export const metadata: Metadata = { title: "Users · PEC Market admin" };
export const dynamic = "force-dynamic";

const control =
  "block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 focus:outline-2 focus:outline-orange-600 sm:text-sm";

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const parsed = userListSchema.safeParse(await searchParams);
  const query: UserListQuery = parsed.success ? parsed.data : {};
  const users = await listUsers(query);

  return (
    <>
      <PageHeader title="Users" description="Search accounts and warn, suspend or reinstate them." />
      <form method="get" role="search" className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
        <label className="space-y-1.5 text-sm font-medium text-slate-700">
          <span>Name, email or phone</span>
          <input type="search" name="q" defaultValue={query.q ?? ""} maxLength={80} className={control} placeholder="e.g. student1" />
        </label>
        <label className="space-y-1.5 text-sm font-medium text-slate-700">
          <span>Role</span>
          <select name="role" defaultValue={query.role ?? ""} className={control}>
            <option value="">All roles</option>
            <option value="CUSTOMER">Customers</option>
            <option value="SHOP_OWNER">Shop owners</option>
            <option value="ADMIN">Admins</option>
          </select>
        </label>
        <label className="space-y-1.5 text-sm font-medium text-slate-700">
          <span>Status</span>
          <select name="status" defaultValue={query.status ?? ""} className={control}>
            <option value="">Any status</option>
            <option value="ACTIVE">Active</option>
            <option value="WARNED">Warned</option>
            <option value="SUSPENDED">Suspended</option>
          </select>
        </label>
        <button type="submit" className={buttonClasses("secondary")}>
          <Search aria-hidden="true" className="size-4" />
          Search
        </button>
      </form>
      {!parsed.success && <p className="mb-3 text-sm text-red-600">{parsed.error.issues[0]?.message}</p>}

      {users.length === 0 ? (
        <EmptyState icon={Users} title="No users match">
          Try a different search or filter.
        </EmptyState>
      ) : (
        <>
          <p className="mb-2 text-xs text-slate-500">
            {users.length === 200 ? "Showing the 200 newest matches." : `${users.length} user${users.length === 1 ? "" : "s"}`}
          </p>
          <ul className="space-y-3">
            {users.map((u) => (
              <li key={u.id} data-testid="admin-user" data-email={u.email} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                      {u.name}
                      <AccountStatusPill status={u.status} />
                    </p>
                    <p className="break-all text-sm text-slate-600">{u.email}</p>
                    <p className="text-xs text-slate-500">
                      {ROLE_LABEL_SHORT[u.role]}
                      {u.shop && <> · {u.shop.name}</>}
                      {u.phone && <> · {u.phone}</>} · joined {formatDate(u.createdAt)}
                      {u.role === "CUSTOMER" && <> · {u._count.orders} orders</>}
                      {u._count.reportsAgainst > 0 && <span className="text-rose-700"> · reported {u._count.reportsAgainst}×</span>}
                    </p>
                    {u.warningMessage && <p className="mt-1 text-xs text-amber-800">Warning: “{u.warningMessage}”</p>}
                  </div>
                </div>
                {u.role !== "ADMIN" && (
                  <div className="mt-3">
                    <ModerationActions endpoint={`/api/admin/users/${u.id}`} subjectName={u.name} status={u.status} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
