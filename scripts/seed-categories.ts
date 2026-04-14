import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { systemCategories } from "../lib/db/schema";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle({ client: sql });

type SubcategoryType = "discretionary" | "semi-discretionary" | "non-discretionary";
type FlowType = "inflow" | "outflow" | "savings" | "misc";

interface CategorySeed {
  name: string;
  slug: string;
  icon: string;
  color: string;
  flowType: FlowType;
  children: { name: string; slug: string; icon: string; subcategoryType?: SubcategoryType }[];
}

const CATEGORY_TREE: CategorySeed[] = [
  {
    name: "Income",
    slug: "income",
    icon: "TrendingUp",
    color: "#0BC18D",
    flowType: "inflow",
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
    flowType: "outflow",
    children: [
      { name: "Rent / Mortgage", slug: "rent-mortgage", icon: "Building", subcategoryType: "non-discretionary" },
      { name: "Utilities", slug: "utilities", icon: "Plug", subcategoryType: "non-discretionary" },
      { name: "Insurance", slug: "insurance-housing", icon: "Shield", subcategoryType: "non-discretionary" },
      { name: "Maintenance", slug: "maintenance", icon: "Wrench", subcategoryType: "semi-discretionary" },
      { name: "Property Tax", slug: "property-tax", icon: "Landmark", subcategoryType: "non-discretionary" },
    ],
  },
  {
    name: "Transportation",
    slug: "transportation",
    icon: "Car",
    color: "#AD74FF",
    flowType: "outflow",
    children: [
      { name: "Fuel", slug: "fuel", icon: "Fuel", subcategoryType: "non-discretionary" },
      { name: "Public Transit", slug: "public-transit", icon: "Train", subcategoryType: "semi-discretionary" },
      { name: "Ride Share", slug: "ride-share", icon: "Navigation", subcategoryType: "semi-discretionary" },
      { name: "Parking", slug: "parking", icon: "ParkingSquare", subcategoryType: "semi-discretionary" },
      { name: "Car Payment", slug: "car-payment", icon: "CarFront", subcategoryType: "non-discretionary" },
      { name: "Car Insurance", slug: "car-insurance", icon: "Shield", subcategoryType: "non-discretionary" },
    ],
  },
  {
    name: "Food & Drink",
    slug: "food-drink",
    icon: "UtensilsCrossed",
    color: "#ECAA0B",
    flowType: "outflow",
    children: [
      { name: "Groceries", slug: "groceries", icon: "ShoppingCart", subcategoryType: "non-discretionary" },
      { name: "Restaurants", slug: "restaurants", icon: "Utensils", subcategoryType: "discretionary" },
      { name: "Coffee", slug: "coffee", icon: "Coffee", subcategoryType: "discretionary" },
      { name: "Delivery", slug: "delivery", icon: "Truck", subcategoryType: "semi-discretionary" },
      { name: "Bars & Nightlife", slug: "bars-nightlife", icon: "Wine", subcategoryType: "discretionary" },
    ],
  },
  {
    name: "Shopping",
    slug: "shopping",
    icon: "ShoppingBag",
    color: "#FF6F69",
    flowType: "outflow",
    children: [
      { name: "Clothing", slug: "clothing", icon: "Shirt", subcategoryType: "discretionary" },
      { name: "Electronics", slug: "electronics", icon: "Monitor", subcategoryType: "discretionary" },
      { name: "Home & Garden", slug: "home-garden", icon: "Flower", subcategoryType: "discretionary" },
      { name: "Personal Care", slug: "personal-care", icon: "Sparkles", subcategoryType: "semi-discretionary" },
      { name: "Online Shopping", slug: "online-shopping", icon: "Globe", subcategoryType: "discretionary" },
    ],
  },
  {
    name: "Entertainment",
    slug: "entertainment",
    icon: "Gamepad2",
    color: "#AD74FF",
    flowType: "outflow",
    children: [
      { name: "Streaming", slug: "streaming", icon: "Tv", subcategoryType: "discretionary" },
      { name: "Gaming", slug: "gaming", icon: "Gamepad", subcategoryType: "discretionary" },
      { name: "Events & Concerts", slug: "events-concerts", icon: "Ticket", subcategoryType: "discretionary" },
      { name: "Hobbies", slug: "hobbies", icon: "Palette", subcategoryType: "discretionary" },
      { name: "Books & Media", slug: "books-media", icon: "Book", subcategoryType: "discretionary" },
    ],
  },
  {
    name: "Health",
    slug: "health",
    icon: "Heart",
    color: "#0BC18D",
    flowType: "outflow",
    children: [
      { name: "Medical", slug: "medical", icon: "Stethoscope", subcategoryType: "non-discretionary" },
      { name: "Pharmacy", slug: "pharmacy", icon: "Pill", subcategoryType: "non-discretionary" },
      { name: "Fitness", slug: "fitness", icon: "Dumbbell", subcategoryType: "semi-discretionary" },
      { name: "Health Insurance", slug: "health-insurance", icon: "ShieldCheck", subcategoryType: "non-discretionary" },
      { name: "Mental Health", slug: "mental-health", icon: "Brain", subcategoryType: "semi-discretionary" },
    ],
  },
  {
    name: "Financial",
    slug: "financial",
    icon: "Landmark",
    color: "#2CA2FF",
    flowType: "outflow",
    children: [
      { name: "Bank Fees", slug: "bank-fees", icon: "AlertCircle", subcategoryType: "non-discretionary" },
      { name: "Interest Charges", slug: "interest-charges", icon: "Percent", subcategoryType: "non-discretionary" },
      { name: "FX Fees", slug: "fx-fees", icon: "Globe", subcategoryType: "non-discretionary" },
      { name: "Investment Fees", slug: "investment-fees", icon: "BarChart", subcategoryType: "semi-discretionary" },
      { name: "ATM Fees", slug: "atm-fees", icon: "CreditCard", subcategoryType: "non-discretionary" },
    ],
  },
  {
    name: "Travel",
    slug: "travel",
    icon: "Plane",
    color: "#ECAA0B",
    flowType: "outflow",
    children: [
      { name: "Flights", slug: "flights", icon: "PlaneTakeoff", subcategoryType: "discretionary" },
      { name: "Hotels", slug: "hotels", icon: "Hotel", subcategoryType: "discretionary" },
      { name: "Activities", slug: "travel-activities", icon: "Map", subcategoryType: "discretionary" },
      { name: "Travel Insurance", slug: "travel-insurance", icon: "Shield", subcategoryType: "semi-discretionary" },
      { name: "Car Rental", slug: "car-rental", icon: "CarFront", subcategoryType: "discretionary" },
    ],
  },
  {
    name: "Education",
    slug: "education",
    icon: "GraduationCap",
    color: "#AD74FF",
    flowType: "outflow",
    children: [
      { name: "Tuition", slug: "tuition", icon: "School", subcategoryType: "non-discretionary" },
      { name: "Books & Supplies", slug: "books-supplies", icon: "BookOpen", subcategoryType: "semi-discretionary" },
      { name: "Courses & Certifications", slug: "courses", icon: "Award", subcategoryType: "semi-discretionary" },
    ],
  },
  {
    name: "Gifts & Donations",
    slug: "gifts-donations",
    icon: "Gift",
    color: "#FF6F69",
    flowType: "outflow",
    children: [
      { name: "Charity", slug: "charity", icon: "HandHeart", subcategoryType: "semi-discretionary" },
      { name: "Gifts", slug: "gifts", icon: "Gift", subcategoryType: "discretionary" },
      { name: "Religious", slug: "religious", icon: "Church", subcategoryType: "semi-discretionary" },
    ],
  },
  {
    name: "Tax",
    slug: "tax",
    icon: "Receipt",
    color: "#EF4444",
    flowType: "outflow",
    children: [
      { name: "Income Tax", slug: "income-tax", icon: "Receipt", subcategoryType: "non-discretionary" },
      { name: "Property Tax", slug: "property-tax-2", icon: "Landmark", subcategoryType: "non-discretionary" },
      { name: "Sales Tax", slug: "sales-tax", icon: "Receipt", subcategoryType: "non-discretionary" },
      { name: "Other Tax", slug: "other-tax", icon: "Receipt", subcategoryType: "non-discretionary" },
    ],
  },
  {
    name: "Transfers",
    slug: "transfers",
    icon: "ArrowLeftRight",
    color: "#808080",
    flowType: "savings",
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
    flowType: "misc",
    children: [
      { name: "Card Payments", slug: "card-payments", icon: "CreditCard" },
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
        flowType: parent.flowType,
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
        subcategoryType: child.subcategoryType ?? null,
        flowType: parent.flowType,
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
