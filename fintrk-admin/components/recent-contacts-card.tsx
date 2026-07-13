"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InfoPopover } from "@/components/info-popover";
import { format } from "date-fns";
import { MessageSquare, MapPin, Mail } from "lucide-react";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface RecentContactsCardProps {
  recentContacts: any[];
}

export function RecentContactsCard({ recentContacts = [] }: RecentContactsCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-pink-500" />
            <CardTitle className="text-sm font-medium">Recent Contacts</CardTitle>
          </div>
          <InfoPopover title="Recent Contact Submissions">
            <p>Latest 5 contact form submissions. Each includes the sender&apos;s name, email, country, and full message.</p>
            <p className="mt-1">Monitor for support patterns, feature requests, and bug reports. Frequent contacts from the same region may indicate localization issues.</p>
          </InfoPopover>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
          {recentContacts.map((c: any) => (
            <div
              key={c.id_submission}
              className="rounded-lg border border-slate-100 p-2.5 hover:bg-slate-50/50 transition-colors"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-semibold text-slate-800">{c.full_name}</p>
                  {c.country && (
                    <div className="flex items-center gap-0.5">
                      <MapPin className="h-2.5 w-2.5 text-slate-300" />
                      <Badge variant="outline" className="text-[9px] py-0 px-1">
                        {c.country}
                      </Badge>
                    </div>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {c.created_at ? format(new Date(c.created_at), "MMM d, h:mm a") : "-"}
                </span>
              </div>
              <div className="flex items-center gap-1 mb-1">
                <Mail className="h-2.5 w-2.5 text-slate-300" />
                <p className="text-[10px] text-muted-foreground truncate">{c.email}</p>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed line-clamp-3">
                {c.message}
              </p>
            </div>
          ))}
          {recentContacts.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">
              No contact submissions yet
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
