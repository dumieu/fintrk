import { redirect } from "next/navigation";

/** Investments tracking lives in Net Worth Atlas; keep URL for old bookmarks. */
export default function InvestmentsPage() {
  redirect("/dashboard/net-worth");
}
