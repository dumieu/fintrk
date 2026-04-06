"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TransactionsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold sm:text-3xl">Transactions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          View and manage all your financial transactions
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transaction History</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-64 text-muted-foreground text-sm">
          No transactions recorded yet. Start adding your income and expenses to track your cash flow.
        </CardContent>
      </Card>
    </div>
  );
}
