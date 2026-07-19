import { FeedbackForm } from "@/components/feedback-form";

export default function DashboardContactPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <FeedbackForm embedded backHref="/dashboard" />
    </div>
  );
}
