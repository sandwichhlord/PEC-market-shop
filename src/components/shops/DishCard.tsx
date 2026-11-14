"use client";

import { Clock, Plus } from "lucide-react";
import { Pill } from "@/components/ui/Pill";
import { Thumb } from "@/components/ui/Thumb";
import { formatPaise } from "@/lib/money";
import type { MenuDish } from "@/server/shops/list";

interface DishCardProps {
  dish: MenuDish;
  shopOpen: boolean;
  inCart: number;
  onOpen: () => void;
  onQuickAdd: () => void;
}

/** One menu row: tap the body for details, or use the Add button. Out-of-stock dishes stay visible but can't be added. */
export function DishCard({ dish, shopOpen, inCart, onOpen, onQuickAdd }: DishCardProps) {
  const canAdd = dish.inStock && shopOpen;
  const blockedReason = dish.inStock ? "shop is closed" : "out of stock";
  return (
    <article
      aria-label={dish.name}
      data-in-stock={dish.inStock}
      className={`flex h-full gap-3 rounded-xl border border-slate-200 p-3 ${dish.inStock ? "bg-white" : "bg-slate-50"}`}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`View details for ${dish.name}`}
        className="flex min-w-0 flex-1 gap-3 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
      >
        <span className={dish.inStock ? "" : "opacity-60 grayscale"}>
          <Thumb src={dish.photoUrl} alt="" size="lg" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-slate-900">{dish.name}</span>
          {dish.description && <span className="mt-0.5 line-clamp-2 block text-sm text-slate-500">{dish.description}</span>}
          <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="font-semibold text-slate-900">{formatPaise(dish.pricePaise)}</span>
            <span className="inline-flex items-center gap-1 text-slate-500">
              <Clock aria-hidden="true" className="size-3.5" />~{dish.prepTimeMinutes} min
            </span>
            {!dish.inStock && <Pill tone="red">Out of stock</Pill>}
          </span>
        </span>
      </button>
      <div className="flex shrink-0 flex-col items-end justify-between gap-2">
        {inCart > 0 ? <span className="text-xs font-medium text-orange-700">{inCart} in cart</span> : <span />}
        <button
          type="button"
          onClick={onQuickAdd}
          disabled={!canAdd}
          aria-label={canAdd ? `Add ${dish.name} to cart` : `${dish.name} can't be added: ${blockedReason}`}
          className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-orange-200 bg-orange-50 px-3 text-sm font-semibold text-orange-700 hover:bg-orange-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
        >
          <Plus aria-hidden="true" className="size-4" />
          Add
        </button>
      </div>
    </article>
  );
}
