"use client";

import { Clock, Minus, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { Sheet } from "@/components/ui/Sheet";
import { MAX_LINE_QUANTITY } from "@/lib/cart/cart";
import { formatPaise } from "@/lib/money";
import type { MenuDish } from "@/server/shops/list";

interface DishSheetProps {
  dish: MenuDish | null;
  shopOpen: boolean;
  onClose: () => void;
  onAdd: (dish: MenuDish, quantity: number) => void;
}

/** Dish detail: big photo, description, prep time, stock and a quantity picker. */
export function DishSheet({ dish, shopOpen, onClose, onAdd }: DishSheetProps) {
  return (
    <Sheet open={dish !== null} onClose={onClose} title={dish?.name ?? "Dish"} hideTitle>
      {/* Keyed so the quantity resets for each dish. */}
      {dish && <DishDetail key={dish.id} dish={dish} shopOpen={shopOpen} onAdd={onAdd} />}
    </Sheet>
  );
}

function DishDetail({ dish, shopOpen, onAdd }: { dish: MenuDish; shopOpen: boolean; onAdd: DishSheetProps["onAdd"] }) {
  const [quantity, setQuantity] = useState(1);
  const canAdd = dish.inStock && shopOpen;
  const stepper =
    "flex size-11 items-center justify-center text-slate-700 hover:bg-slate-50 disabled:text-slate-300 focus-visible:outline-2 focus-visible:outline-orange-600";

  return (
    <div className="space-y-4">
      {dish.photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- uploads include SVG placeholders, which next/image will not optimise
        <img
          src={dish.photoUrl}
          alt={dish.name}
          className="aspect-[4/3] w-full rounded-xl border border-slate-200 bg-slate-100 object-cover"
        />
      )}
      <div>
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-xl font-semibold text-slate-900">{dish.name}</h3>
          <p className="shrink-0 text-lg font-semibold text-slate-900">{formatPaise(dish.pricePaise)}</p>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Clock aria-hidden="true" className="size-3.5" />~{dish.prepTimeMinutes} min
          </span>
          <Pill tone={dish.inStock ? "green" : "red"}>{dish.inStock ? "In stock" : "Out of stock"}</Pill>
        </div>
        {dish.description && <p className="mt-3 text-sm leading-relaxed text-slate-700">{dish.description}</p>}
      </div>

      {canAdd ? (
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-lg border border-slate-300" role="group" aria-label="Quantity">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              aria-label="Decrease quantity"
              className={`${stepper} rounded-l-lg`}
            >
              <Minus aria-hidden="true" className="size-4" />
            </button>
            <output aria-live="polite" className="w-8 text-center font-semibold">
              {quantity}
            </output>
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.min(MAX_LINE_QUANTITY, q + 1))}
              disabled={quantity >= MAX_LINE_QUANTITY}
              aria-label="Increase quantity"
              className={`${stepper} rounded-r-lg`}
            >
              <Plus aria-hidden="true" className="size-4" />
            </button>
          </div>
          <Button className="flex-1" onClick={() => onAdd(dish, quantity)}>
            Add to cart · {formatPaise(dish.pricePaise * quantity)}
          </Button>
        </div>
      ) : (
        <Button className="w-full" disabled>
          {dish.inStock ? "Shop is closed" : "Out of stock"}
        </Button>
      )}
    </div>
  );
}
