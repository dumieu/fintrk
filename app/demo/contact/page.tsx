import { DemoAppShell } from "../demo-app-shell";
import { FeedbackForm } from "@/components/feedback-form";

export default function DemoContact() {
  return (
    <DemoAppShell>
      <div className="min-h-[calc(100vh-4rem)] bg-background">
        <FeedbackForm embedded backHref="/demo/cashflow" />
      </div>
    </DemoAppShell>
  );
}
