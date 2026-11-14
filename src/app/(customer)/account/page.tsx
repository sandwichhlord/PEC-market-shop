import type { Metadata } from "next";
import { LogoutButton } from "@/components/shell/LogoutButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { requirePageUser } from "@/server/auth/current";

export const metadata: Metadata = { title: "Account · PEC Market" };

export default async function AccountPage() {
  const user = await requirePageUser("CUSTOMER");
  const rows: [string, string][] = [
    ["Name", user.name],
    ["Email", user.email],
    ["Phone", user.phone ?? "Not set"],
  ];
  return (
    <>
      <PageHeader title="Account" />
      <dl className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
        {rows.map(([label, value]) => (
          <div key={label} className="flex flex-wrap justify-between gap-2 px-4 py-3 text-sm">
            <dt className="text-slate-500">{label}</dt>
            <dd className="min-w-0 break-words font-medium text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4">
        <LogoutButton loginPath="/login" className="border border-slate-300 bg-white" />
      </div>
    </>
  );
}
