# PEC Market — Product Spec

Source: "PEC Market – Food Ordering Web App, Software Engineering Course Build Brief (v2)".
Sections marked **[filled gap]** are decisions added so the build can run without questions.

## 1. Summary

A marketplace web app for the food shops in the PEC market. Students (customers) browse shops, order,
and pay online via Stripe; shops receive the order automatically and update its status, which the customer
sees live. Three portals: **Customer**, **Shop Owner**, **Admin**. **Online payment only** — no cash/offline option anywhere.

## 2. Roles and auth

- Separate signup + login pages for Customer (`/signup`, `/login`) and Shop Owner (`/shop/signup`, `/shop/login`).
  Admin logs in at `/admin/login`; admins are created only by the seed script. **[filled gap]**
- Email/password; JWT in httpOnly cookie. Logging into the wrong portal with a valid account shows
  "This account is a <role> account" and a link to the right portal. **[filled gap]**
- Each shop-owner account owns exactly one Shop, created during shop signup: name, description, logo (upload),
  location within the market (free text, e.g. "Stall 4, near SAC"). **[filled gap: location is free text]**
- Account status: `ACTIVE`, `WARNED`, `SUSPENDED`. Suspended users cannot log in or call any API and see a
  clear message. Warned users see a dismissible banner with the warning reason. **[filled gap]**

## 3. Customer portal

| Feature | Details |
|---|---|
| Browse shops | List of active shops: logo, name, location, average rating, open/closed. Search by name. |
| Shop menu | Per dish: name, photo, price, est. prep time, description, live in-stock / out-of-stock (updates without refresh). Out-of-stock dishes are visible but cannot be added. |
| Cart | Cart holds items from **one shop at a time** **[filled gap]**; adding from a second shop asks to clear the cart. Quantity +/−, remove, subtotal. |
| Checkout & pay | Server re-validates stock and prices, creates the Order (`PENDING_PAYMENT`) with `price_at_order` snapshots, then redirects to Stripe Checkout. No service fee or tax lines. **[filled gap]** |
| Auto-notify kitchen | When payment succeeds (webhook **or** success-page verification, whichever comes first, idempotent) the order becomes `PLACED_PAID`, the shop gets a real-time notification + the order appears on its dashboard instantly. |
| Payment failure | Cancelled/failed checkout → order `PAYMENT_FAILED`, payment `FAILED`; cart is kept so the user can retry. Unpaid orders never reach the shop. |
| Live tracking | Order page with a status timeline that updates in real time: Placed & Paid → Preparing → Ready for Pickup → Completed. Shows estimated ready time (max prep time of items from when Preparing started). **[filled gap]** |
| Order history | All past and current orders, newest first, with colour-coded status badges; "Active" and "Past" tabs. |
| Refunds & complaints | See §6. |
| Reviews | Only when order is `COMPLETED`; one review per order: 1–5 stars, text (optional, ≤1000 chars), up to 3 photos. Shown on the shop page with average rating. |
| Notifications | Bell icon with unread count; in-app list; real-time toast on every status change of the user's orders and dispute updates. Mark read / mark all read. |

## 4. Shop portal

| Feature | Details |
|---|---|
| Incoming orders dashboard | Live list (new orders appear without refresh, with a sound-free highlight). Each: order number, items + qty, customer name, total, payment status, time placed, status. Filter: Active / Completed / Disputes. |
| Confirm & prepare | Button "Payment received – start preparing" moves `PLACED_PAID → PREPARING`; customer is updated instantly. |
| Further updates | "Ready for pickup" (`PREPARING → READY_FOR_PICKUP`), "Mark completed" (`READY_FOR_PICKUP → COMPLETED`). |
| Menu management | Add / edit / delete dishes (name, description, photo upload, price, prep time minutes). Deleting a dish that appears in past orders soft-deletes it (`isArchived`). **[filled gap]** |
| Stock control | One-tap in/out-of-stock toggle per dish; customers viewing the menu see it change live. |
| Shop profile | Edit name, description, logo, location; toggle shop open/closed. **[filled gap]** |
| Disputes | View and respond to refund requests and complaints on its orders (see §6). |
| Report customer | From an order: flag the customer with a reason (`NO_SHOW`, `MISBEHAVIOR`, `OTHER`) + description. Goes to admin. |

## 5. Order status flow

Order `status` enum:
`PENDING_PAYMENT`, `PAYMENT_FAILED`, `PLACED_PAID`, `PREPARING`, `READY_FOR_PICKUP`, `COMPLETED`,
`REFUND_REQUESTED`, `REFUNDED`, `COMPLAINT_FILED`, `RESOLVED`.

Payment `paymentStatus` enum (per brief): `PENDING`, `PAID`, `REFUND_REQUESTED`, `REFUNDED`, `PARTIALLY_REFUNDED` **[filled gap]**, `FAILED`.

Allowed transitions (anything else is rejected with 409):

| From | To | Who |
|---|---|---|
| PENDING_PAYMENT | PLACED_PAID | system (payment confirmed) |
| PENDING_PAYMENT | PAYMENT_FAILED | system |
| PAYMENT_FAILED | PLACED_PAID | system (late success from Stripe) |
| PLACED_PAID | PREPARING | shop |
| PREPARING | READY_FOR_PICKUP | shop |
| READY_FOR_PICKUP | COMPLETED | shop |
| PLACED_PAID, PREPARING, READY_FOR_PICKUP | REFUND_REQUESTED | customer |
| REFUND_REQUESTED | REFUNDED | shop (approve) or admin (force) |
| REFUND_REQUESTED | *previous status* | shop rejects → dispute escalates to admin, order resumes **[filled gap]** |
| PLACED_PAID … COMPLETED | COMPLAINT_FILED | customer |
| COMPLAINT_FILED | RESOLVED | shop or admin |
| COMPLAINT_FILED | REFUNDED | admin (force refund) |

`OrderEvent` table records every transition (from, to, actor, timestamp) and powers the tracking timeline.
A partial refund (only some items) sets paymentStatus `PARTIALLY_REFUNDED`; the order goes to `REFUNDED` only if
fully refunded, otherwise returns to its previous status. **[filled gap]**

## 6. Disputes, refunds, reports

- **Refund request (customer):** for orders `PLACED_PAID`/`PREPARING`/`READY_FOR_PICKUP`. Customer selects the
  unavailable item(s) (or "whole order") + reason. Refund amount = sum of selected items' `price_at_order × qty`.
- **Shop response:** Approve → refund issued via `PaymentProvider.refund()` (Stripe Refunds API), statuses updated,
  customer notified. Reject (with reason) → complaint status `ESCALATED`, visible to admin.
- **Complaint (customer):** free-text complaint on any paid order; shop can reply and mark resolved, or admin resolves.
- **Admin:** sees all refund requests and complaints (filter by status/shop), can **force a Stripe refund** (full or
  item-level) and resolve with a note. Sees all customer reports from shops; can **warn** (with message),
  **suspend**, or **reinstate** an account; can also suspend a shop owner. Dismiss report.
- Complaint `status`: `OPEN`, `ESCALATED`, `RESOLVED`, `REJECTED`. Report `status`: `OPEN`, `ACTIONED`, `DISMISSED`.

## 7. Payments

- Stripe Checkout Session (mode `payment`, line items from order, `metadata.orderId`, success/cancel URLs).
- Webhook `/api/payments/stripe/webhook` verifies signature; handles `checkout.session.completed`,
  `checkout.session.expired`, `checkout.session.async_payment_failed`, `charge.refunded`.
- Success page also retrieves the session and confirms payment (so it works locally without the Stripe CLI).
- Store `stripePaymentId` (PaymentIntent id) and `stripeCheckoutSessionId` on the order.
- `MockProvider`: checkout redirects to an internal `/pay/mock/[orderId]` page with "Pay" and "Fail" buttons;
  refunds succeed instantly. Used in E2E tests and whenever no Stripe key is configured.

## 8. UI/UX

Clean, minimal, mobile-first (test at 375px). Colour-coded status badges:
PENDING_PAYMENT grey · PLACED_PAID blue · PREPARING amber · READY_FOR_PICKUP green (pulsing dot) ·
COMPLETED slate · PAYMENT_FAILED red · REFUND_REQUESTED orange · REFUNDED purple · COMPLAINT_FILED rose · RESOLVED teal.
Simple navigation: bottom tab bar on mobile for customers (Shops, Orders, Notifications, Account); sidebar for shop & admin.
Loading skeletons, empty states, and error states on every list page. Accessible labels on all controls.

## 9. Data model (brief + filled gaps)

- **User**: id, role (CUSTOMER/SHOP_OWNER/ADMIN), name, email (unique), passwordHash, phone?, status, warningMessage?, createdAt
- **Shop**: id, ownerId (unique), name, description, logoUrl, location, isOpen, createdAt
- **MenuItem**: id, shopId, name, description, photoUrl, pricePaise, prepTimeMinutes, inStock, isArchived
- **Order**: id, orderNumber (short human id), customerId, shopId, status, totalPaise, paymentStatus, stripeCheckoutSessionId?, stripePaymentId?, refundedPaise, createdAt, updatedAt
- **OrderItem**: id, orderId, menuItemId, nameAtOrder, quantity, pricePaiseAtOrder, refunded (bool)
- **OrderEvent**: id, orderId, fromStatus, toStatus, actorId?, note?, createdAt
- **Review**: id, orderId (unique), customerId, shopId, rating, comment, photos (String[]), createdAt
- **Complaint**: id, orderId, raisedById, type (REFUND/COMPLAINT), description, itemIds (String[]), refundAmountPaise?, status, resolution?, shopResponse?, createdAt, updatedAt
- **CustomerReport**: id, shopId, customerId, orderId?, reason, description, status, adminNote?, createdAt
- **Notification**: id, userId, type, title, body, link, readAt?, createdAt

## 10. Seed data

Admin (`admin@pec.test` / `admin123`), 4 shops with owners (`shop1@pec.test` … `shop4@pec.test` / `shop123`) —
e.g. a chai & snacks stall, a south-Indian counter, a juice bar, a fast-food counter — 6–10 dishes each with
realistic INR prices, prep times, and locally generated SVG placeholder images (no network). Two customers
(`student1@pec.test`, `student2@pec.test` / `student123`) with a few historical orders in various states and reviews.

## 11. Assumptions (from brief)

Multiple shops can register (marketplace). Basic admin/moderator layer included. Reviews only after Completed.
Real-time sync is required — no refresh-to-check.
