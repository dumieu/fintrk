import { redirect } from "next/navigation";

export default async function Home() {
  let userId: string | null = null;

  if (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    const { auth } = await import("@clerk/nextjs/server");
    const authResult = await auth();
    userId = authResult.userId;
  }

  if (!userId) redirect("/auth");
  redirect("/dashboard");
}
