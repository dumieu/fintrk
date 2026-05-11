import { redirect } from "next/navigation";
import { resilientAuth } from "@/lib/auth-resilient";

const CLERK_CONFIGURED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default async function Home() {
  if (!CLERK_CONFIGURED) {
    redirect("/unauth1");
  }
  const { userId } = await resilientAuth();
  if (!userId) redirect("/unauth1");
  redirect("/dashboard");
}
