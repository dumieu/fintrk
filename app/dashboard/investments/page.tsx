"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function InvestmentsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold sm:text-3xl">Investments</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Monitor stocks, crypto, real estate, and other investment vehicles
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Investment Portfolio</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-64 text-muted-foreground text-sm">
          Add your investment holdings to track performance and returns over time
        </CardContent>
      </Card>
    </div>
  );
}
