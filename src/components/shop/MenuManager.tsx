"use client";

import { Clock, Pencil, Plus, Trash2, UtensilsCrossed } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Sheet } from "@/components/ui/Sheet";
import { Switch } from "@/components/ui/Switch";
import { Thumb } from "@/components/ui/Thumb";
import { apiFetch } from "@/lib/api-client";
import { formatPaise } from "@/lib/money";
import type { OwnerDish } from "@/server/shops/menu";
import { DishForm } from "./DishForm";

type Editing = { mode: "add" } | { mode: "edit"; dish: OwnerDish } | null;

/** The shop owner's menu: one-tap stock toggles, add / edit in a sheet, delete with confirmation. */
export function MenuManager({ shopId, initialDishes }: { shopId: string; initialDishes: OwnerDish[] }) {
  const [dishes, setDishes] = useState(initialDishes);
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<OwnerDish | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [stockPending, setStockPending] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const replace = (dish: OwnerDish) => setDishes((list) => list.map((d) => (d.id === dish.id ? dish : d)));

  async function toggleStock(dish: OwnerDish, inStock: boolean) {
    setMessage(null);
    setStockPending((s) => new Set(s).add(dish.id));
    replace({ ...dish, inStock }); // optimistic
    const result = await apiFetch<{ dish: OwnerDish }>(`/api/shops/${shopId}/menu/${dish.id}/stock`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inStock }),
    });
    setStockPending((s) => {
      const next = new Set(s);
      next.delete(dish.id);
      return next;
    });
    if (result.ok) {
      replace(result.data.dish);
    } else {
      replace(dish);
      setMessage({ tone: "error", text: result.error.message });
    }
  }

  function onSaved(saved: OwnerDish) {
    const isNew = editing?.mode === "add";
    setDishes((list) => (isNew ? [...list, saved] : list.map((d) => (d.id === saved.id ? saved : d))));
    setEditing(null);
    setMessage({ tone: "success", text: isNew ? `${saved.name} added to the menu.` : `${saved.name} updated.` });
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeletePending(true);
    const result = await apiFetch<{ result: "deleted" | "archived" }>(`/api/shops/${shopId}/menu/${deleting.id}`, {
      method: "DELETE",
    });
    setDeletePending(false);
    if (result.ok) {
      setDishes((list) => list.filter((d) => d.id !== deleting.id));
      setMessage({
        tone: "success",
        text:
          result.data.result === "archived"
            ? `${deleting.name} removed from the menu. It stays in past orders.`
            : `${deleting.name} deleted.`,
      });
    } else {
      setMessage({ tone: "error", text: result.error.message });
    }
    setDeleting(null);
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setEditing({ mode: "add" })}>
          <Plus aria-hidden="true" className="size-4" />
          Add dish
        </Button>
      </div>
      {message && (
        <div className="mb-4">
          <Alert tone={message.tone}>{message.text}</Alert>
        </div>
      )}
      {dishes.length === 0 ? (
        <EmptyState icon={UtensilsCrossed} title="Your menu is empty">
          Add your first dish so customers can order it.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {dishes.map((dish) => (
            <li key={dish.id}>
              <article
                aria-label={dish.name}
                data-in-stock={dish.inStock}
                className={`flex h-full gap-3 rounded-xl border border-slate-200 p-3 ${dish.inStock ? "bg-white" : "bg-slate-50"}`}
              >
                <span className={dish.inStock ? "" : "opacity-60 grayscale"}>
                  <Thumb src={dish.photoUrl} alt="" size="lg" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold break-words text-slate-900">{dish.name}</h2>
                  {dish.description && <p className="line-clamp-2 text-sm text-slate-500">{dish.description}</p>}
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm">
                    <span className="font-semibold text-slate-900">{formatPaise(dish.pricePaise)}</span>
                    <span className="inline-flex items-center gap-1 text-slate-500">
                      <Clock aria-hidden="true" className="size-3.5" />~{dish.prepTimeMinutes} min
                    </span>
                  </p>
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-1">
                    <Switch
                      checked={dish.inStock}
                      onChange={(v) => toggleStock(dish, v)}
                      disabled={stockPending.has(dish.id)}
                      label={`${dish.name} in stock`}
                    >
                      <span className={dish.inStock ? "text-emerald-700" : "text-red-700"}>
                        {dish.inStock ? "In stock" : "Out of stock"}
                      </span>
                    </Switch>
                    <span className="flex">
                      <button
                        type="button"
                        onClick={() => setEditing({ mode: "edit", dish })}
                        aria-label={`Edit ${dish.name}`}
                        className="rounded-lg p-3 text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-orange-600"
                      >
                        <Pencil aria-hidden="true" className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(dish)}
                        aria-label={`Delete ${dish.name}`}
                        className="rounded-lg p-3 text-red-600 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-orange-600"
                      >
                        <Trash2 aria-hidden="true" className="size-4" />
                      </button>
                    </span>
                  </div>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing?.mode === "edit" ? "Edit dish" : "Add dish"}>
        {editing && (
          <DishForm
            key={editing.mode === "edit" ? editing.dish.id : "new"}
            shopId={shopId}
            dish={editing.mode === "edit" ? editing.dish : null}
            onSaved={onSaved}
          />
        )}
      </Sheet>

      <Sheet open={deleting !== null} onClose={() => setDeleting(null)} title="Delete dish">
        {deleting && (
          <div className="space-y-4 pt-2">
            <p className="text-sm text-slate-700">
              Delete <strong>{deleting.name}</strong>? Customers will no longer see it. If it appears in past orders it is
              kept in their history.
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setDeleting(null)}>
                Cancel
              </Button>
              <Button variant="danger" className="flex-1" loading={deletePending} onClick={confirmDelete}>
                Delete
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </>
  );
}
