"use client";

import { CashflowSankey, type CashflowSankeyData } from "@/components/cashflow-sankey";

const SAMPLE: CashflowSankeyData = {
  currency: "USD",
  availableCurrencies: ["USD"],
  dateFrom: "2025-10-17",
  dateTo: "2026-04-17",
  inflow: {
    flow: "inflow",
    value: 28500,
    count: 18,
    categories: [
      {
        name: "Salary & Compensation",
        color: "#0BC18D",
        value: 22000,
        count: 6,
        subs: [
          { name: "Base Salary", value: 18000, count: 6, leaves: [
            { name: "Acme Corp", value: 18000, count: 6 },
          ]},
          { name: "Bonus", value: 3000, count: 1, leaves: [{ name: "Q1 Bonus", value: 3000, count: 1 }] },
          { name: "Allowance", value: 1000, count: 2, leaves: [{ name: "Unlabeled", value: 1000, count: 2 }] },
        ],
      },
      {
        name: "Investment Income",
        color: "#34D399",
        value: 4200,
        count: 8,
        subs: [
          { name: "Dividends", value: 2400, count: 5, leaves: [
            { name: "VOO", value: 1500, count: 3 },
            { name: "AAPL", value: 600, count: 1 },
            { name: "MSFT", value: 300, count: 1 },
          ]},
          { name: "Interest", value: 1200, count: 2, leaves: [{ name: "HYSA", value: 1200, count: 2 }] },
          { name: "Capital Gains", value: 600, count: 1, leaves: [{ name: "Unlabeled", value: 600, count: 1 }] },
        ],
      },
      {
        name: "Side Hustle",
        color: "#22D3EE",
        value: 1800,
        count: 3,
        subs: [
          { name: "Freelance", value: 1500, count: 2, leaves: [{ name: "Project A", value: 1500, count: 2 }] },
          { name: "Tutoring", value: 300, count: 1, leaves: [{ name: "Unlabeled", value: 300, count: 1 }] },
        ],
      },
      {
        name: "Refunds",
        color: "#A78BFA",
        value: 500,
        count: 1,
        subs: [],
      },
    ],
  },
  outflow: {
    flow: "outflow",
    value: 19200,
    count: 142,
    categories: [
      {
        name: "Housing",
        color: "#2CA2FF",
        value: 5400,
        count: 8,
        subs: [
          { name: "Rent", value: 4200, count: 6, leaves: [{ name: "Apartment", value: 4200, count: 6 }] },
          { name: "Utilities", value: 800, count: 2, leaves: [
            { name: "ConEd", value: 500, count: 1 },
            { name: "Water", value: 300, count: 1 },
          ]},
          { name: "Internet", value: 400, count: 2, leaves: [{ name: "Verizon", value: 400, count: 2 }] },
        ],
      },
      {
        name: "Food & Drink",
        color: "#ECAA0B",
        value: 3200,
        count: 48,
        subs: [
          { name: "Groceries", value: 1800, count: 22, leaves: [
            { name: "Whole Foods", value: 1100, count: 12 },
            { name: "Trader Joe's", value: 500, count: 8 },
            { name: "Unlabeled", value: 200, count: 2 },
          ]},
          { name: "Restaurants", value: 1100, count: 18, leaves: [
            { name: "Date Night", value: 600, count: 6 },
            { name: "Lunch Out", value: 400, count: 10 },
            { name: "Unlabeled", value: 100, count: 2 },
          ]},
          { name: "Coffee", value: 300, count: 8, leaves: [{ name: "Blue Bottle", value: 300, count: 8 }] },
        ],
      },
      {
        name: "Transportation",
        color: "#AD74FF",
        value: 1800,
        count: 22,
        subs: [
          { name: "Rideshare", value: 700, count: 14, leaves: [{ name: "Uber", value: 700, count: 14 }] },
          { name: "Subway", value: 350, count: 5, leaves: [{ name: "MTA", value: 350, count: 5 }] },
          { name: "Gas", value: 450, count: 2, leaves: [{ name: "Shell", value: 450, count: 2 }] },
          { name: "Parking", value: 300, count: 1, leaves: [{ name: "Unlabeled", value: 300, count: 1 }] },
        ],
      },
      {
        name: "Shopping",
        color: "#F472B6",
        value: 2200,
        count: 14,
        subs: [
          { name: "Clothing", value: 1100, count: 6, leaves: [
            { name: "Nike", value: 600, count: 3 },
            { name: "Uniqlo", value: 500, count: 3 },
          ]},
          { name: "Electronics", value: 800, count: 2, leaves: [{ name: "Apple", value: 800, count: 2 }] },
          { name: "Home Goods", value: 300, count: 6, leaves: [{ name: "IKEA", value: 300, count: 6 }] },
        ],
      },
      {
        name: "Entertainment",
        color: "#FB923C",
        value: 900,
        count: 12,
        subs: [
          { name: "Streaming", value: 240, count: 6, leaves: [
            { name: "Netflix", value: 90, count: 3 },
            { name: "Spotify", value: 60, count: 3 },
            { name: "Disney+", value: 90, count: 3 },
          ]},
          { name: "Concerts", value: 460, count: 3, leaves: [{ name: "Unlabeled", value: 460, count: 3 }] },
          { name: "Movies", value: 200, count: 3, leaves: [{ name: "AMC", value: 200, count: 3 }] },
        ],
      },
      {
        name: "Health & Fitness",
        color: "#10B981",
        value: 1100,
        count: 8,
        subs: [
          { name: "Gym", value: 360, count: 6, leaves: [{ name: "Equinox", value: 360, count: 6 }] },
          { name: "Pharmacy", value: 240, count: 1, leaves: [{ name: "CVS", value: 240, count: 1 }] },
          { name: "Doctor", value: 500, count: 1, leaves: [{ name: "Unlabeled", value: 500, count: 1 }] },
        ],
      },
      {
        name: "Travel",
        color: "#FBBF24",
        value: 2800,
        count: 6,
        subs: [
          { name: "Flights", value: 1800, count: 2, leaves: [{ name: "Delta", value: 1800, count: 2 }] },
          { name: "Hotels", value: 700, count: 2, leaves: [{ name: "Marriott", value: 700, count: 2 }] },
          { name: "Tours", value: 300, count: 2, leaves: [{ name: "Unlabeled", value: 300, count: 2 }] },
        ],
      },
      {
        name: "Subscriptions",
        color: "#818CF8",
        value: 350,
        count: 9,
        subs: [
          { name: "Software", value: 250, count: 6, leaves: [
            { name: "Adobe", value: 100, count: 3 },
            { name: "Notion", value: 90, count: 3 },
            { name: "GitHub", value: 60, count: 3 },
          ]},
          { name: "News", value: 100, count: 3, leaves: [{ name: "NYTimes", value: 100, count: 3 }] },
        ],
      },
      {
        name: "Tax",
        color: "#EF4444",
        value: 1450,
        count: 1,
        subs: [
          { name: "Estimated Tax", value: 1450, count: 1, leaves: [{ name: "IRS", value: 1450, count: 1 }] },
        ],
      },
    ],
  },
  savings: {
    flow: "savings",
    value: 6800,
    count: 12,
    categories: [
      {
        name: "Retirement",
        color: "#9333EA",
        value: 3000,
        count: 6,
        subs: [
          { name: "401(k)", value: 2400, count: 6, leaves: [{ name: "Employer Match", value: 2400, count: 6 }] },
          { name: "Roth IRA", value: 600, count: 1, leaves: [{ name: "Vanguard", value: 600, count: 1 }] },
        ],
      },
      {
        name: "Investments",
        color: "#A78BFA",
        value: 2400,
        count: 4,
        subs: [
          { name: "Brokerage", value: 1800, count: 2, leaves: [
            { name: "Index Funds", value: 1200, count: 1 },
            { name: "Tech Stocks", value: 600, count: 1 },
          ]},
          { name: "Crypto", value: 600, count: 2, leaves: [
            { name: "BTC", value: 400, count: 1 },
            { name: "ETH", value: 200, count: 1 },
          ]},
        ],
      },
      {
        name: "Cash Savings",
        color: "#C9A4FF",
        value: 1400,
        count: 2,
        subs: [
          { name: "Emergency Fund", value: 1000, count: 1, leaves: [{ name: "HYSA", value: 1000, count: 1 }] },
          { name: "Sinking Fund", value: 400, count: 1, leaves: [{ name: "Vacation", value: 400, count: 1 }] },
        ],
      },
    ],
  },
};

export default function CashflowPreviewPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#08051a] via-[#10082a] to-[#160e35] p-6">
      <h1 className="mb-4 text-2xl font-bold text-white">Cashflow Sankey · Preview (sample data)</h1>
      <CashflowSankey data={SAMPLE} height={760} showParticles={true} />
    </div>
  );
}
