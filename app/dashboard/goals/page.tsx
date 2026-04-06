"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function GoalsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold sm:text-3xl">Financial Goals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Set savings targets, track milestones, and reach your financial objectives
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your Goals</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-64 text-muted-foreground text-sm">
          Create your first financial goal — emergency fund, house down payment, retirement, and more
        </CardContent>
      </Card>
    </div>
  );
}
