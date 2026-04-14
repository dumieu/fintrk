export type FlowType = "inflow" | "outflow" | "savings" | "misc";

export interface SubcategoryData {
  id: string;
  name: string;
}

export interface CategoryData {
  id: string;
  name: string;
  subcategories: SubcategoryData[];
}

export interface FlowData {
  id: string;
  type: FlowType;
  name: string;
  color: string;
  categories: CategoryData[];
}

let _counter = 0;
function uid(): string {
  return `cat-${(++_counter).toString(36)}`;
}

/** Inflow = green, savings & investments = purple, outflow = red, misc = grey. */
export const FLOW_COLORS: Record<FlowType, string> = {
  inflow: "#22C55E",
  outflow: "#EF4444",
  savings: "#9333EA",
  misc: "#808080",
};

export const FLOW_LABELS: Record<FlowType, string> = {
  inflow: "Inflow",
  outflow: "Outflow",
  savings: "Savings & Investments",
  misc: "Misc",
};

export const FLOW_TOOLTIPS: Record<FlowType, string> = {
  inflow: "Money coming in — salary, freelance, dividends, refunds",
  outflow: "Money going out — bills, shopping, dining, subscriptions",
  savings: "Money set aside — transfers to savings, investments, retirement",
  misc: "Uncategorized or ambiguous transactions",
};

export function getDefaultCategories(): FlowData[] {
  return [
    {
      id: uid(), type: "inflow", name: "Inflow", color: FLOW_COLORS.inflow,
      categories: [
        { id: uid(), name: "Employment", subcategories: [
          { id: uid(), name: "Base Salary" }, { id: uid(), name: "Bonus" },
          { id: uid(), name: "Commission" }, { id: uid(), name: "Allowance" },
        ]},
        { id: uid(), name: "Investment", subcategories: [
          { id: uid(), name: "Dividends" }, { id: uid(), name: "Interest" },
          { id: uid(), name: "Rental Income" }, { id: uid(), name: "Capital Gains" },
        ]},
        { id: uid(), name: "Other Income", subcategories: [
          { id: uid(), name: "Side Hustle" }, { id: uid(), name: "Government Payouts" },
          { id: uid(), name: "Gifts Received" },
        ]},
      ],
    },
    {
      id: uid(), type: "savings", name: "Savings & Investments", color: FLOW_COLORS.savings,
      categories: [
        { id: uid(), name: "Retirement", subcategories: [
          { id: uid(), name: "CPF Contributions" }, { id: uid(), name: "SRS" },
        ]},
        { id: uid(), name: "Investments", subcategories: [
          { id: uid(), name: "Brokerage" }, { id: uid(), name: "Crypto" },
          { id: uid(), name: "Real Estate Equity" },
        ]},
        { id: uid(), name: "Cash Savings", subcategories: [
          { id: uid(), name: "Emergency Fund" }, { id: uid(), name: "Sinking Funds" },
        ]},
      ],
    },
    {
      id: uid(), type: "outflow", name: "Outflow", color: FLOW_COLORS.outflow,
      categories: [
        { id: uid(), name: "Education", subcategories: [
          { id: uid(), name: "Books & Courses" }, { id: uid(), name: "Business" },
        ]},
        { id: uid(), name: "Health & Fitness", subcategories: [
          { id: uid(), name: "Fitness" }, { id: uid(), name: "Medical" },
          { id: uid(), name: "Other" },
        ]},
        { id: uid(), name: "Domestic Help", subcategories: [
          { id: uid(), name: "Helper Salary" }, { id: uid(), name: "Helper Levy & Insurance" },
        ]},
        { id: uid(), name: "Household", subcategories: [
          { id: uid(), name: "Rent" }, { id: uid(), name: "Mortgage" },
          { id: uid(), name: "Utilities & Repair" }, { id: uid(), name: "Subscriptions" },
          { id: uid(), name: "Furnishings & Decor" }, { id: uid(), name: "Condo & HOA Fees" },
          { id: uid(), name: "Other" },
        ]},
        { id: uid(), name: "Restaurant & Entertainment", subcategories: [
          { id: uid(), name: "Restaurants" }, { id: uid(), name: "Food Court" },
          { id: uid(), name: "Entertainment" }, { id: uid(), name: "Others" },
        ]},
        { id: uid(), name: "School & Extracurricular", subcategories: [
          { id: uid(), name: "Fees" }, { id: uid(), name: "Extracurricular" },
          { id: uid(), name: "Meals" }, { id: uid(), name: "Other" },
        ]},
        { id: uid(), name: "Shopping", subcategories: [
          { id: uid(), name: "Groceries & Convenience" }, { id: uid(), name: "Apparel & Beauty" },
          { id: uid(), name: "Tech" }, { id: uid(), name: "Others" },
        ]},
        { id: uid(), name: "Tax", subcategories: [
          { id: uid(), name: "Income Tax" }, { id: uid(), name: "Property Tax" },
        ]},
        { id: uid(), name: "Transport", subcategories: [
          { id: uid(), name: "Public Transport" }, { id: uid(), name: "Rideshare" },
          { id: uid(), name: "Car Loan" }, { id: uid(), name: "Petrol" },
          { id: uid(), name: "Parking & Tolls" }, { id: uid(), name: "Maintenance & Repairs" },
          { id: uid(), name: "Road Tax & Insurance" },
        ]},
        { id: uid(), name: "Travel", subcategories: [
          { id: uid(), name: "Accommodation" }, { id: uid(), name: "Airlines" },
          { id: uid(), name: "Car Rental" }, { id: uid(), name: "Various Expenses" },
        ]},
        { id: uid(), name: "Debt Repayment", subcategories: [
          { id: uid(), name: "Credit Card" }, { id: uid(), name: "Personal Loan" },
          { id: uid(), name: "Student Loan" },
        ]},
        { id: uid(), name: "Insurance", subcategories: [
          { id: uid(), name: "Life" }, { id: uid(), name: "Health & Critical Illness" },
          { id: uid(), name: "Home" }, { id: uid(), name: "Auto" },
          { id: uid(), name: "Disability" },
        ]},
        { id: uid(), name: "Giving", subcategories: [
          { id: uid(), name: "Parental Allowance" }, { id: uid(), name: "Charity & Donations" },
          { id: uid(), name: "Gifts" },
        ]},
        { id: uid(), name: "Personal Care", subcategories: [
          { id: uid(), name: "Salon & Barber" }, { id: uid(), name: "Spa & Massage" },
          { id: uid(), name: "Cosmetics" },
        ]},
        { id: uid(), name: "Financial Fees", subcategories: [
          { id: uid(), name: "Bank & ATM Fees" }, { id: uid(), name: "Late Fees" },
          { id: uid(), name: "Credit Card Annual Fees" },
        ]},
        { id: uid(), name: "Pets", subcategories: [
          { id: uid(), name: "Food" }, { id: uid(), name: "Vet Bills" },
          { id: uid(), name: "Grooming" }, { id: uid(), name: "Accessories" },
        ]},
        { id: uid(), name: "Family & Kids", subcategories: [
          { id: uid(), name: "Childcare & Babysitting" }, { id: uid(), name: "Toys & Gear" },
        ]},
        { id: uid(), name: "Other", subcategories: [
          { id: uid(), name: "Other" },
        ]},
      ],
    },
  ];
}
