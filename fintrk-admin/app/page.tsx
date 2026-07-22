import { redirect } from "next/navigation";

/** Fallback if middleware is bypassed — still lands on xTRK Admin FinTRK. */
export default function Page() {
  redirect("https://admin.xtrk.ai/admin/fintrk/overview");
}
