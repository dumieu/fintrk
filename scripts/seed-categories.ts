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
    name: "Tax",
    slug: "tax",
    icon: "Receipt",
    color: "#EF4444",
    flowType: "outflow",
    children: [
      { name: "Income Tax", slug: "income-tax", icon: "Receipt", subcategoryType: "non-discretionary" },
      { name: "Property Tax", slug: "property-tax-2", icon: "Receipt", subcategoryType: "non-discretionary" },
      { name: "Other", slug: "other-tax-misc", icon: "Receipt", subcategoryType: "non-discretionary" },
    ],
  },
  {
    name: "Household",
    slug: "housing",
    icon: "Home",
    color: "#2CA2FF",
    flowType: "outflow",
    children: [
      { name: "Rent / Mortgage", slug: "rent-mortgage", icon: "Building", subcategoryType: "non-discretionary" },
      { name: "Utilities", slug: "utilities", icon: "Plug", subcategoryType: "non-discretionary" },
      { name: "Domestic Help", slug: "domestic-help", icon: "Users", subcategoryType: "non-discretionary" },
      { name: "Property Insurance", slug: "insurance-housing", icon: "Shield", subcategoryType: "non-discretionary" },
      { name: "Maintenance", slug: "maintenance", icon: "Wrench", subcategoryType: "semi-discretionary" },
      { name: "Other", slug: "other-household", icon: "MoreHorizontal" },
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
      { name: "Car Maintenance", slug: "car-maintenance", icon: "Wrench", subcategoryType: "semi-discretionary" },
      { name: "Ride Share & Taxi", slug: "ride-share", icon: "Navigation", subcategoryType: "semi-discretionary" },
      { name: "Parking", slug: "parking", icon: "ParkingSquare", subcategoryType: "semi-discretionary" },
      { name: "Car Payment", slug: "car-payment", icon: "CarFront", subcategoryType: "non-discretionary" },
      { name: "Car Insurance", slug: "car-insurance", icon: "Shield", subcategoryType: "non-discretionary" },
      { name: "Other", slug: "other-transport", icon: "MoreHorizontal" },
    ],
  },
  {
    name: "Shopping",
    slug: "shopping",
    icon: "ShoppingBag",
    color: "#FF6F69",
    flowType: "outflow",
    children: [
      { name: "Technology", slug: "technology", icon: "Monitor", subcategoryType: "discretionary" },
      { name: "Home & Garden", slug: "electronics", icon: "Flower", subcategoryType: "discretionary" },
      { name: "Groceries, Food & Drink", slug: "groceries-food-drink", icon: "ShoppingCart", subcategoryType: "non-discretionary" },
      { name: "Personal Care", slug: "personal-care", icon: "Sparkles", subcategoryType: "semi-discretionary" },
      { name: "Online Shopping", slug: "online-shopping", icon: "Globe", subcategoryType: "discretionary" },
      { name: "Apparel", slug: "apparel", icon: "Shirt", subcategoryType: "discretionary" },
      { name: "Other", slug: "other-shopping", icon: "MoreHorizontal" },
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
      { name: "Restaurants & Delivery", slug: "restaurants-delivery", icon: "Utensils", subcategoryType: "discretionary" },
      { name: "Bars & Nightlife", slug: "bars-nightlife-ent", icon: "Wine", subcategoryType: "discretionary" },
      { name: "Events & Concerts", slug: "events-concerts", icon: "Ticket", subcategoryType: "discretionary" },
      { name: "Hobbies", slug: "hobbies", icon: "Palette", subcategoryType: "discretionary" },
      { name: "Other", slug: "other-entertainment", icon: "MoreHorizontal" },
    ],
  },
  {
    name: "Health & Fitness",
    slug: "health",
    icon: "Heart",
    color: "#0BC18D",
    flowType: "outflow",
    children: [
      { name: "Medical", slug: "medical", icon: "Stethoscope", subcategoryType: "non-discretionary" },
      { name: "Fitness", slug: "fitness", icon: "Dumbbell", subcategoryType: "semi-discretionary" },
      { name: "Health Insurance", slug: "health-insurance", icon: "ShieldCheck", subcategoryType: "non-discretionary" },
      { name: "Other", slug: "other-health", icon: "MoreHorizontal" },
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
      { name: "Accommodation", slug: "accommodation", icon: "Hotel", subcategoryType: "discretionary" },
      { name: "Meals", slug: "travel-meals", icon: "Utensils", subcategoryType: "discretionary" },
      { name: "Activities", slug: "travel-activities", icon: "Map", subcategoryType: "discretionary" },
      { name: "Travel Insurance", slug: "travel-insurance", icon: "Shield", subcategoryType: "semi-discretionary" },
      { name: "Car Rental", slug: "car-rental", icon: "CarFront", subcategoryType: "discretionary" },
      { name: "Other", slug: "other-travel", icon: "MoreHorizontal" },
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
      { name: "School", slug: "school", icon: "School", subcategoryType: "semi-discretionary" },
      { name: "Extracurricular Activities", slug: "extracurricular", icon: "Award", subcategoryType: "semi-discretionary" },
      { name: "Books & Media", slug: "books-media-edu", icon: "BookOpen", subcategoryType: "semi-discretionary" },
      { name: "Courses & Certifications", slug: "courses", icon: "Award", subcategoryType: "semi-discretionary" },
      { name: "Other", slug: "other-education", icon: "MoreHorizontal" },
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
      { name: "Other", slug: "other-gifts", icon: "MoreHorizontal" },
    ],
  },
  {
    name: "Other Outflow",
    slug: "other-outflow",
    icon: "MoreHorizontal",
    color: "#808080",
    flowType: "outflow",
    children: [
      { name: "ATM Withdrawal", slug: "atm-withdrawal-outflow", icon: "Banknote" },
    ],
  },
  {
    name: "Transfers",
    slug: "transfers",
    icon: "ArrowLeftRight",
    color: "#808080",
    flowType: "savings",
    children: [{ name: "Internal Transfer", slug: "internal-transfer", icon: "Repeat" }],
  },
  {
    name: "Other Misc",
    slug: "other",
    icon: "MoreHorizontal",
    color: "#808080",
    flowType: "misc",
    children: [
      { name: "Card Payments", slug: "card-payments", icon: "CreditCard" },
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
