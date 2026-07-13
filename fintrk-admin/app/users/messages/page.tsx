"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquare, MessagesSquare } from "lucide-react";

import { FeedbackSubmissionsDashboard } from "@/components/feedback-submissions-dashboard";
import { RecentContactsCard } from "@/components/recent-contacts-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

export default function MessagesPage() {
  const [contacts, setContacts] = useState<unknown[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);

  const loadContacts = useCallback(async () => {
    setLoadingContacts(true);
    try {
      const res = await fetch("/api/contact-submissions/recent");
      if (!res.ok) throw new Error("fail");
      const data = await res.json();
      setContacts(Array.isArray(data) ? data : []);
    } catch {
      setContacts([]);
    } finally {
      setLoadingContacts(false);
    }
  }, []);

  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);

  return (
    <>
      <div className="flex items-start gap-2.5 mb-8">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-pink-500 to-rose-600 shadow-sm">
          <MessagesSquare className="h-4 w-4 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Messages
          </h1>
          <p className="mt-1 text-sm text-slate-500 max-w-2xl">
            Feedback and contact submissions from FinTRK users
          </p>
        </div>
      </div>

      <Tabs defaultValue="feedback" className="space-y-4">
        <TabsList>
          <TabsTrigger value="feedback" className="gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />
            Feedback
          </TabsTrigger>
          <TabsTrigger value="messages" className="gap-1.5">
            <MessagesSquare className="h-3.5 w-3.5" />
            Contact
          </TabsTrigger>
        </TabsList>
        <TabsContent value="feedback">
          <FeedbackSubmissionsDashboard />
        </TabsContent>
        <TabsContent value="messages">
          {loadingContacts ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <RecentContactsCard recentContacts={contacts} />
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}
