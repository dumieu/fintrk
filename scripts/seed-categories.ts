import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { systemCategories } from "../lib/db/schema";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle({ client: sql });

interface CategorySeed {
  name: string;
  slug: string;
  icon: string;
  color: string;
  children: { name: string; slug: string; icon: string }[];
}

const CATEGORY_TREE: CategorySeed[] = [
  {
    name: "Income",
    slug: "income",
    icon: "TrendingUp",
    color: "#0BC18D",
    children: [
      { name: "Salary", slug: "salary", icon: "Banknote" },
      { name: "Freelance", slug: "freelance", icon: "Briefcase" },
      { name: "Investment Returns", slug: "investment-returns", icon: "LineChart" },
      { name: "Refunds", slug: "refunds", icon: "RotateCcw" },
      { name: "Side Income", slug: "side-income", icon: "Zap" },
    ],
  },
  {
    name: "Housing",
    slug: "housing",
    icon: "Home",
    color: "#2CA2FF",
    children: [
      { name: "Rent / Mortgage", slug: "rent-mortgage", icon: "Building" },
      { name: "Utilities", slug: "utilities", icon: "Plug" },
      { name: "Insurance", slug: "insurance-housing", icon: "Shield" },
      { name: "Maintenance", slug: "maintenance", icon: "Wrench" },
      { name: "Property Tax", slug: "property-tax", icon: "Landmark" },
    ],
  },
  {
    name: "Transportation",
    slug: "transportation",
    icon: "Car",
    color: "#AD74FF",
    children: [
      { name: "Fuel", slug: "fuel", icon: "Fuel" },
      { name: "Public Transit", slug: "public-transit", icon: "Train" },
      { name: "Ride Share", slug: "ride-share", icon: "Navigation" },
      { name: "Parking", slug: "parking", icon: "ParkingSquare" },
      { name: "Car Payment", slug: "car-payment", icon: "CarFront" },
      { name: "Car Insurance", slug: "car-insurance", icon: "Shield" },
    ],
  },
  {
    name: "Food & Drink",
    slug: "food-drink",
    icon: "UtensilsCrossed",
    color: "#ECAA0B",
    children: [
      { name: "Groceries", slug: "groceries", icon: "ShoppingCart" },
      { name: "Restaurants", slug: "restaurants", icon: "Utensils" },
      { name: "Coffee", slug: "coffee", icon: "Coffee" },
      { name: "Delivery", slug: "delivery", icon: "Truck" },
      { name: "Bars & Nightlife", slug: "bars-nightlife", icon: "Wine" },
    ],
  },
  {
    name: "Shopping",
    slug: "shopping",
    icon: "ShoppingBag",
    color: "#FF6F69",
    children: [
      { name: "Clothing", slug: "clothing", icon: "Shirt" },
      { name: "Electronics", slug: "electronics", icon: "Monitor" },
      { name: "Home & Garden", slug: "home-garden", icon: "Flower" },
      { name: "Personal Care", slug: "personal-care", icon: "Sparkles" },
      { name: "Online Shopping", slug: "online-shopping", icon: "Globe" },
    ],
  },
  {
    name: "Entertainment",
    slug: "entertainment",
    icon: "Gamepad2",
    color: "#AD74FF",
    children: [
      { name: "Streaming", slug: "streaming", icon: "Tv" },
      { name: "Gaming", slug: "gaming", icon: "Gamepad" },
      { name: "Events & Concerts", slug: "events-concerts", icon: "Ticket" },
      { name: "Hobbies", slug: "hobbies", icon: "Palette" },
      { name: "Books & Media", slug: "books-media", icon: "Book" },
    ],
  },
  {
    name: "Health",
    slug: "health",
    icon: "Heart",
    color: "#0BC18D",
    children: [
      { name: "Medical", slug: "medical", icon: "Stethoscope" },
      { name: "Pharmacy", slug: "pharmacy", icon: "Pill" },
      { name: "Fitness", slug: "fitness", icon: "Dumbbell" },
      { name: "Health Insurance", slug: "health-insurance", icon: "ShieldCheck" },
      { name: "Mental Health", slug: "mental-health", icon: "Brain" },
    ],
  },
  {
    name: "Financial",
    slug: "financial",
    icon: "Landmark",
    color: "#2CA2FF",
    children: [
      { name: "Bank Fees", slug: "bank-fees", icon: "AlertCircle" },
      { name: "Interest Charges", slug: "interest-charges", icon: "Percent" },
      { name: "FX Fees", slug: "fx-fees", icon: "Globe" },
      { name: "Investment Fees", slug: "investment-fees", icon: "BarChart" },
      { name: "ATM Fees", slug: "atm-fees", icon: "CreditCard" },
    ],
  },
  {
    name: "Travel",
    slug: "travel",
    icon: "Plane",
    color: "#ECAA0B",
    children: [
      { name: "Flights", slug: "flights", icon: "PlaneTakeoff" },
      { name: "Hotels", slug: "hotels", icon: "Hotel" },
      { name: "Activities", slug: "travel-activities", icon: "Map" },
      { name: "Travel Insurance", slug: "travel-insurance", icon: "Shield" },
      { name: "Car Rental", slug: "car-rental", icon: "CarFront" },
    ],
  },
  {
    name: "Education",
    slug: "education",
    icon: "GraduationCap",
    color: "#AD74FF",
    children: [
      { name: "Tuition", slug: "tuition", icon: "School" },
      { name: "Books & Supplies", slug: "books-supplies", icon: "BookOpen" },
      { name: "Courses & Certifications", slug: "courses", icon: "Award" },
    ],
  },
  {
    name: "Gifts & Donations",
    slug: "gifts-donations",
    icon: "Gift",
    color: "#FF6F69",
    children: [
      { name: "Charity", slug: "charity", icon: "HandHeart" },
      { name: "Gifts", slug: "gifts", icon: "Gift" },
      { name: "Religious", slug: "religious", icon: "Church" },
    ],
  },
  {
    name: "Transfers",
    slug: "transfers",
    icon: "ArrowLeftRight",
    color: "#808080",
    children: [
      { name: "Internal Transfer", slug: "internal-transfer", icon: "Repeat" },
      { name: "Loan Payment", slug: "loan-payment", icon: "FileText" },
      { name: "Credit Card Payment", slug: "credit-card-payment", icon: "CreditCard" },
      { name: "Savings Transfer", slug: "savings-transfer", icon: "PiggyBank" },
    ],
  },
  {
    name: "Other",
    slug: "other",
    icon: "MoreHorizontal",
    color: "#808080",
    children: [
      { name: "Uncategorized", slug: "uncategorized", icon: "HelpCircle" },
      { name: "ATM Withdrawal", slug: "atm-withdrawal", icon: "Banknote" },
      { name: "Cash", slug: "cash", icon: "Coins" },
      { name: "Miscellaneous", slug: "miscellaneous", icon: "Package" },
    ],
  },
];

async function seed() {
  console.log("Seeding system_categories...");

  const existing = await db.select({ id: systemCategories.id }).from(systemCategories);
  if (existing.length > 0) {
    console.log(`Already ${existing.length} system categories in DB — skipping seed.`);
    return;
  }

  let order = 0;
  for (const parent of CATEGORY_TREE) {
    const [inserted] = await db
      .insert(systemCategories)
      .values({
        name: parent.name,
        slug: parent.slug,
        icon: parent.icon,
        color: parent.color,
        sortOrder: order++,
      })
      .returning({ id: systemCategories.id });

    for (const child of parent.children) {
      await db.insert(systemCategories).values({
        name: child.name,
        slug: child.slug,
        parentId: inserted.id,
        icon: child.icon,
        color: parent.color,
        sortOrder: order++,
      });
    }
  }

  const total = await db.select({ id: systemCategories.id }).from(systemCategories);
  console.log(`Seeded ${total.length} system categories.`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
