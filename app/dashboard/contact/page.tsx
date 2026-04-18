"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
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
