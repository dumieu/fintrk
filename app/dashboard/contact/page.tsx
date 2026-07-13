import { redirect } from "next/navigation";

/** In-app Contact menu item; public form lives at `/contact`. */
export default function DashboardContactPage() {
  redirect("/contact");
}
