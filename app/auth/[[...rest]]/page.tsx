import type { Metadata } from "next";
import { headers } from "next/headers";
import { SignIn, SignUp } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { CardDescription, CardTitle } from "@/components/ui/card";

export async function generateMetadata(): Promise<Metadata> {
  const hdrs = await headers();
  const url = hdrs.get("x-nextjs-url") ?? hdrs.get("x-url") ?? "";
  const isSignUp = url.includes("/sign-up");
  return {
    title: isSignUp ? "Sign Up" : "Sign In",
    robots: { index: false, follow: false },
  };
}

export default async function AuthPage({
  params,
}: {
  params: Promise<{ rest?: string[] }>;
}) {
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

  const segments = (await params).rest ?? [];
  const isSignUp = segments[0] === "sign-up";

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="absolute h-96 w-96 rounded-full bg-emerald-200/30 dark:bg-emerald-900/20 blur-3xl animate-float"
          style={{ top: "10%", left: "10%" }}
        />
        <div
          className="absolute h-96 w-96 rounded-full bg-teal-200/30 dark:bg-teal-900/20 blur-3xl animate-float-delayed"
          style={{ top: "60%", right: "10%" }}
        />
      </div>

      <div className="relative z-10 mx-4 flex w-full max-w-md flex-col items-center gap-6 sm:mx-auto">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
              <span className="text-3xl font-bold text-white">F</span>
            </div>
          </div>
          <CardTitle className="mt-3 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-600 bg-clip-text text-3xl font-bold text-transparent sm:text-4xl">
            FinTRK
          </CardTitle>
          <CardDescription className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
            Track precisely. Invest intelligently. Build wealth.
          </CardDescription>
        </div>

        {isSignUp ? (
          <SignUp
            routing="path"
            path="/auth/sign-up"
            signInUrl="/auth"
            fallbackRedirectUrl="/dashboard"
          />
        ) : (
          <SignIn
            routing="path"
            path="/auth"
            signUpUrl="/auth/sign-up"
            fallbackRedirectUrl="/dashboard"
          />
        )}
      </div>
    </div>
  );
}
