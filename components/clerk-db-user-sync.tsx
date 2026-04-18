import { syncAuthenticatedUserIfStale } from "@/lib/clerk-user-sync";

/** Server-only: keeps Neon `users` aligned when Clerk webhooks are delayed or missed. */
export async function ClerkDbUserSync() {
  await syncAuthenticatedUserIfStale();
  return null;
}
