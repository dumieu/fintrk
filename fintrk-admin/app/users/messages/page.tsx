"use client";

import { MessagesSquare } from "lucide-react";

import { FeedbackSubmissionsDashboard } from "@/components/feedback-submissions-dashboard";

export default function MessagesPage() {
  return (
    <>
      <div className="mb-8 flex items-start gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-pink-500 to-rose-600 shadow-sm">
          <MessagesSquare className="h-4 w-4 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Messages</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Feedback submissions from FinTRK users
          </p>
        </div>
      </div>

      <FeedbackSubmissionsDashboard />
    </>
  );
}
