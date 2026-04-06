"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold sm:text-3xl">Contact</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Get in touch with the FinTRK team
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Send us a message</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-64 text-muted-foreground text-sm">
          Contact form coming soon
        </CardContent>
      </Card>
    </div>
  );
}
