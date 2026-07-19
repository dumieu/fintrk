import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { FeedbackForm } from "@/components/feedback-form";

export const metadata = {
  title: "Feedback - FinTRK",
  description:
    "Share your feedback with the FinTRK team. Your thoughts help us build a better finance tracking experience.",
};

export default async function FeedbackPage() {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }));
  if (userId) {
    redirect("/dashboard/contact");
  }

  return (
    <div className="min-h-screen bg-background">
      <FeedbackForm backHref="/" />
    </div>
  );
}
