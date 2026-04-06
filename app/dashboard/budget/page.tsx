"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function BudgetPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold sm:text-3xl">Budget & Expenses</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Set budgets, categorize spending, and stay on track
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Monthly Budget</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-64 text-muted-foreground text-sm">
          Create budget categories and set monthly spending limits to start tracking
        </CardContent>
      </Card>
    </div>
  );
}
