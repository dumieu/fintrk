"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold sm:text-3xl">FAQ</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Frequently asked questions about FinTRK
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Common Questions</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-64 text-muted-foreground text-sm">
          FAQ entries will be added as the platform grows
        </CardContent>
      </Card>
    </div>
  );
}
