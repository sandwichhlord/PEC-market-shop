// Static seed data per SPEC §10. Every row has a fixed id/unique key so the seed can upsert idempotently.
import type { OrderStatus, PaymentStatus, ReportReason } from "../src/generated/prisma/enums";

// Deployments set SEED_*_PASSWORD so the public demo passwords below never reach a live database. Unset (local dev,
// tests) the documented defaults apply. Note: the seed only sets a password when it first creates the user.
export const SEED_PASSWORDS = {
  admin: process.env.SEED_ADMIN_PASSWORD || "admin123",
  shop: process.env.SEED_SHOP_PASSWORD || "shop123",
  customer: process.env.SEED_CUSTOMER_PASSWORD || "student123",
};

export interface SeedDish {
  key: string;
  name: string;
  description: string;
  pricePaise: number;
  prepTimeMinutes: number;
  inStock?: boolean;
}

export interface SeedShop {
  key: string;
  ownerEmail: string;
  ownerName: string;
  ownerPhone: string;
  name: string;
  description: string;
  location: string;
  color: string;
  isOpen: boolean;
  dishes: SeedDish[];
}

export const SEED_ADMIN = { email: "admin@pec.test", name: "Market Admin" };

export const SEED_CUSTOMERS = [
  { key: "student1", email: "student1@pec.test", name: "Aarav Sharma", phone: "9876500001" },
  { key: "student2", email: "student2@pec.test", name: "Simran Kaur", phone: "9876500002" },
] as const;

export type SeedCustomerKey = (typeof SEED_CUSTOMERS)[number]["key"];

export const SEED_SHOPS: SeedShop[] = [
  {
    key: "shop1",
    ownerEmail: "shop1@pec.test",
    ownerName: "Rajinder Singh",
    ownerPhone: "9876510001",
    name: "Forks n Knives Cafe",
    description: "Kadak chai, hot snacks and quick bites between lectures.",
    location: "Stall 1, near SAC",
    color: "#b45309",
    isOpen: true,
    dishes: [
      {
        key: "masala-chai",
        name: "Masala Chai",
        description: "Strong ginger-cardamom tea.",
        pricePaise: 1500,
        prepTimeMinutes: 4,
      },
      {
        key: "bun-maska",
        name: "Bun Maska",
        description: "Soft bun with a thick layer of butter.",
        pricePaise: 2500,
        prepTimeMinutes: 3,
      },
      {
        key: "samosa",
        name: "Samosa (2 pcs)",
        description: "Crispy potato-pea samosas with chutney.",
        pricePaise: 3000,
        prepTimeMinutes: 5,
      },
      {
        key: "bread-pakora",
        name: "Bread Pakora",
        description: "Gram-flour fried bread stuffed with aloo.",
        pricePaise: 3000,
        prepTimeMinutes: 7,
      },
      {
        key: "maggi",
        name: "Masala Maggi",
        description: "Classic hostel-style masala noodles.",
        pricePaise: 4500,
        prepTimeMinutes: 8,
      },
      {
        key: "veg-sandwich",
        name: "Veg Grilled Sandwich",
        description: "Grilled with veggies, cheese and green chutney.",
        pricePaise: 6000,
        prepTimeMinutes: 10,
      },
      {
        key: "cold-coffee",
        name: "Cold Coffee",
        description: "Blended chilled coffee with ice cream.",
        pricePaise: 5000,
        prepTimeMinutes: 5,
      },
      {
        key: "kachori",
        name: "Kachori",
        description: "Moong-dal kachori with aloo sabzi.",
        pricePaise: 3500,
        prepTimeMinutes: 6,
        inStock: false,
      },
    ],
  },
  {
    key: "shop2",
    ownerEmail: "shop2@pec.test",
    ownerName: "Lakshmi Iyer",
    ownerPhone: "9876510002",
    name: "Paratha Cafe",
    description: "Crisp dosas, fluffy idlis and filter coffee from the south.",
    location: "Stall 4, opposite the library",
    color: "#15803d",
    isOpen: true,
    dishes: [
      {
        key: "masala-dosa",
        name: "Masala Dosa",
        description: "Crisp dosa with spiced potato, sambar and chutney.",
        pricePaise: 8000,
        prepTimeMinutes: 12,
      },
      {
        key: "plain-dosa",
        name: "Plain Dosa",
        description: "Golden crisp dosa with sambar and chutney.",
        pricePaise: 6000,
        prepTimeMinutes: 10,
      },
      {
        key: "idli-sambar",
        name: "Idli Sambar (3 pcs)",
        description: "Steamed rice cakes with sambar.",
        pricePaise: 5000,
        prepTimeMinutes: 6,
      },
      {
        key: "medu-vada",
        name: "Medu Vada (2 pcs)",
        description: "Crispy lentil doughnuts.",
        pricePaise: 5000,
        prepTimeMinutes: 8,
      },
      {
        key: "uttapam",
        name: "Onion Uttapam",
        description: "Thick rice pancake topped with onions.",
        pricePaise: 7500,
        prepTimeMinutes: 12,
      },
      {
        key: "rava-dosa",
        name: "Rava Masala Dosa",
        description: "Lacy semolina dosa with potato filling.",
        pricePaise: 9000,
        prepTimeMinutes: 15,
      },
      {
        key: "filter-coffee",
        name: "Filter Coffee",
        description: "South Indian decoction coffee.",
        pricePaise: 2500,
        prepTimeMinutes: 4,
      },
    ],
  },
  {
    key: "shop3",
    ownerEmail: "shop3@pec.test",
    ownerName: "Manpreet Gill",
    ownerPhone: "9876510003",
    name: "Combo Juice Bar",
    description: "Fresh juices, shakes and fruit bowls made to order.",
    location: "Stall 7, near the main gate",
    color: "#c2410c",
    isOpen: true,
    dishes: [
      {
        key: "orange-juice",
        name: "Fresh Orange Juice",
        description: "Squeezed to order, no added sugar.",
        pricePaise: 6000,
        prepTimeMinutes: 5,
      },
      {
        key: "mosambi-juice",
        name: "Mosambi Juice",
        description: "Sweet lime juice, chilled.",
        pricePaise: 5000,
        prepTimeMinutes: 5,
      },
      {
        key: "banana-shake",
        name: "Banana Shake",
        description: "Thick banana milkshake.",
        pricePaise: 6000,
        prepTimeMinutes: 4,
      },
      {
        key: "mango-shake",
        name: "Mango Shake",
        description: "Seasonal mango milkshake.",
        pricePaise: 8000,
        prepTimeMinutes: 4,
        inStock: false,
      },
      {
        key: "watermelon-juice",
        name: "Watermelon Juice",
        description: "Refreshing and light.",
        pricePaise: 5000,
        prepTimeMinutes: 4,
      },
      {
        key: "fruit-bowl",
        name: "Fruit Bowl",
        description: "Seasonal cut fruits with chaat masala.",
        pricePaise: 7000,
        prepTimeMinutes: 6,
      },
      {
        key: "lassi",
        name: "Sweet Lassi",
        description: "Punjabi-style thick lassi.",
        pricePaise: 5000,
        prepTimeMinutes: 3,
      },
      {
        key: "lemon-soda",
        name: "Masala Lemon Soda",
        description: "Fizzy lemon soda with masala.",
        pricePaise: 3000,
        prepTimeMinutes: 2,
      },
      {
        key: "pineapple-juice",
        name: "Pineapple Juice",
        description: "Fresh pineapple, lightly sweet.",
        pricePaise: 6500,
        prepTimeMinutes: 5,
      },
    ],
  },
  {
    key: "shop4",
    ownerEmail: "shop4@pec.test",
    ownerName: "Vikram Mehta",
    ownerPhone: "9876510004",
    name: "Gyoza Cafe",
    description: "Burgers, rolls, fries and momos for late-night cravings.",
    location: "Stall 10, behind the auditorium",
    color: "#b91c1c",
    isOpen: true,
    dishes: [
      {
        key: "aloo-tikki-burger",
        name: "Aloo Tikki Burger",
        description: "Crispy potato patty, onions and mayo.",
        pricePaise: 6000,
        prepTimeMinutes: 8,
      },
      {
        key: "paneer-burger",
        name: "Paneer Burger",
        description: "Grilled paneer patty with mint mayo.",
        pricePaise: 9000,
        prepTimeMinutes: 10,
      },
      {
        key: "french-fries",
        name: "French Fries",
        description: "Salted crispy fries.",
        pricePaise: 7000,
        prepTimeMinutes: 7,
      },
      {
        key: "peri-peri-fries",
        name: "Peri Peri Fries",
        description: "Fries tossed in peri peri masala.",
        pricePaise: 8000,
        prepTimeMinutes: 7,
      },
      {
        key: "veg-momos",
        name: "Veg Momos (8 pcs)",
        description: "Steamed momos with spicy red chutney.",
        pricePaise: 7000,
        prepTimeMinutes: 12,
      },
      {
        key: "paneer-roll",
        name: "Paneer Kathi Roll",
        description: "Paneer tikka wrapped in a paratha.",
        pricePaise: 10000,
        prepTimeMinutes: 10,
      },
      {
        key: "veg-pizza",
        name: 'Veg Pizza (7")',
        description: "Onion, capsicum, corn and cheese.",
        pricePaise: 15000,
        prepTimeMinutes: 15,
      },
      {
        key: "chilli-potato",
        name: "Honey Chilli Potato",
        description: "Crispy potatoes in sweet-spicy sauce.",
        pricePaise: 11000,
        prepTimeMinutes: 12,
      },
      { key: "coke", name: "Coke (300 ml)", description: "Chilled can.", pricePaise: 4000, prepTimeMinutes: 1 },
      {
        key: "spring-roll",
        name: "Veg Spring Roll",
        description: "Crispy rolls with vegetable filling.",
        pricePaise: 9000,
        prepTimeMinutes: 10,
      },
    ],
  },
];

/** One step of an order's history: the status it moved to, who did it, and minutes after the order was created. */
export interface SeedStep {
  to: OrderStatus;
  by: "customer" | "shop" | "system" | "admin";
  atMinute: number;
  note?: string;
}

export interface SeedOrder {
  orderNumber: string;
  customer: SeedCustomerKey;
  shop: string;
  /** Minutes before the seed ran that the order was created. */
  minutesAgo: number;
  items: { dish: string; quantity: number; refunded?: boolean }[];
  /** Transitions after creation (creation itself is recorded as null → PENDING_PAYMENT). */
  steps: SeedStep[];
  paymentStatus: PaymentStatus;
  /** Fully refunded orders set this to the order total. */
  fullyRefunded?: boolean;
  review?: { rating: number; comment: string; photoDishes?: string[] };
  complaint?: {
    type: "REFUND" | "COMPLAINT";
    description: string;
    status: "OPEN" | "ESCALATED" | "RESOLVED" | "REJECTED";
    shopResponse?: string;
    resolution?: string;
  };
}

const DAY = 24 * 60;

export const SEED_ORDERS: SeedOrder[] = [
  {
    orderNumber: "PEC1001",
    customer: "student1",
    shop: "shop1",
    minutesAgo: 3 * DAY,
    items: [
      { dish: "masala-chai", quantity: 2 },
      { dish: "samosa", quantity: 1 },
    ],
    steps: [
      { to: "PLACED_PAID", by: "system", atMinute: 1 },
      { to: "PREPARING", by: "shop", atMinute: 3 },
      { to: "READY_FOR_PICKUP", by: "shop", atMinute: 9 },
      { to: "COMPLETED", by: "shop", atMinute: 15 },
    ],
    paymentStatus: "PAID",
    review: { rating: 5, comment: "Best chai on campus, samosas were piping hot.", photoDishes: ["masala-chai"] },
  },
  {
    orderNumber: "PEC1002",
    customer: "student1",
    shop: "shop2",
    minutesAgo: 2 * DAY,
    items: [
      { dish: "masala-dosa", quantity: 1 },
      { dish: "filter-coffee", quantity: 1 },
    ],
    steps: [
      { to: "PLACED_PAID", by: "system", atMinute: 1 },
      { to: "PREPARING", by: "shop", atMinute: 2 },
      { to: "READY_FOR_PICKUP", by: "shop", atMinute: 14 },
      { to: "COMPLETED", by: "shop", atMinute: 20 },
    ],
    paymentStatus: "PAID",
    review: { rating: 4, comment: "Crispy dosa, sambar could be hotter." },
  },
  {
    orderNumber: "PEC1003",
    customer: "student1",
    shop: "shop3",
    minutesAgo: 10,
    items: [
      { dish: "orange-juice", quantity: 1 },
      { dish: "fruit-bowl", quantity: 1 },
    ],
    steps: [
      { to: "PLACED_PAID", by: "system", atMinute: 1 },
      { to: "PREPARING", by: "shop", atMinute: 3 },
    ],
    paymentStatus: "PAID",
  },
  {
    orderNumber: "PEC1004",
    customer: "student1",
    shop: "shop4",
    minutesAgo: DAY,
    items: [{ dish: "paneer-burger", quantity: 1 }],
    steps: [{ to: "PAYMENT_FAILED", by: "system", atMinute: 2, note: "Checkout cancelled" }],
    paymentStatus: "FAILED",
  },
  {
    orderNumber: "PEC1005",
    customer: "student2",
    shop: "shop1",
    minutesAgo: 4 * DAY,
    items: [
      { dish: "maggi", quantity: 1 },
      { dish: "cold-coffee", quantity: 1 },
    ],
    steps: [
      { to: "PLACED_PAID", by: "system", atMinute: 1 },
      { to: "PREPARING", by: "shop", atMinute: 4 },
      { to: "READY_FOR_PICKUP", by: "shop", atMinute: 12 },
      { to: "COMPLETED", by: "shop", atMinute: 18 },
    ],
    paymentStatus: "PAID",
    review: { rating: 4, comment: "Good maggi, quick service." },
  },
  {
    orderNumber: "PEC1006",
    customer: "student2",
    shop: "shop4",
    minutesAgo: DAY + 120,
    items: [{ dish: "veg-pizza", quantity: 1, refunded: true }],
    steps: [
      { to: "PLACED_PAID", by: "system", atMinute: 1 },
      { to: "REFUND_REQUESTED", by: "customer", atMinute: 5, note: "Pizza base not available" },
      { to: "REFUNDED", by: "shop", atMinute: 8, note: "Sorry, out of pizza bases today." },
    ],
    paymentStatus: "REFUNDED",
    fullyRefunded: true,
    complaint: {
      type: "REFUND",
      description: "Shop said pizza base was not available.",
      status: "RESOLVED",
      shopResponse: "Sorry, out of pizza bases today. Full refund issued.",
    },
  },
  {
    orderNumber: "PEC1007",
    customer: "student2",
    shop: "shop2",
    minutesAgo: 2,
    items: [
      { dish: "idli-sambar", quantity: 2 },
      { dish: "medu-vada", quantity: 1 },
    ],
    steps: [{ to: "PLACED_PAID", by: "system", atMinute: 1 }],
    paymentStatus: "PAID",
  },
  {
    orderNumber: "PEC1008",
    customer: "student2",
    shop: "shop3",
    minutesAgo: 5 * DAY,
    items: [{ dish: "banana-shake", quantity: 1 }],
    steps: [
      { to: "PLACED_PAID", by: "system", atMinute: 1 },
      { to: "PREPARING", by: "shop", atMinute: 2 },
      { to: "READY_FOR_PICKUP", by: "shop", atMinute: 6 },
      { to: "COMPLETED", by: "shop", atMinute: 10 },
      { to: "COMPLAINT_FILED", by: "customer", atMinute: 30 },
    ],
    paymentStatus: "PAID",
    complaint: { type: "COMPLAINT", description: "The shake was warm and too sweet.", status: "OPEN" },
  },
];

export interface SeedReport {
  id: string;
  shop: string;
  customer: SeedCustomerKey;
  orderNumber?: string;
  reason: ReportReason;
  description: string;
}

export const SEED_REPORTS: SeedReport[] = [
  {
    id: "seed_report_1",
    shop: "shop1",
    customer: "student2",
    orderNumber: "PEC1005",
    reason: "NO_SHOW",
    description: "Took 40 minutes to pick up the order after it was ready.",
  },
];
