import { redirect } from "next/navigation";

/** Portfolio overview lives in Net Worth Atlas; keep URL for old bookmarks. */
export default function PortfolioPage() {
  redirect("/dashboard/net-worth");
}
