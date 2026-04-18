import "server-only";

import type { UserJSON } from "@clerk/backend";
import { clerkClient, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";

import { db, resilientQuery } from "@/lib/db";
import { users } from "@/lib/db/schema";

function primaryEmailFromUserJson(data: UserJSON): string | null {
  const pid = data.primary_email_address_id;
  if (!pid || !data.email_addresses?.length) return null;
  const match = data.email_addresses.find((e) => e.id === pid);
  return match?.email_address ?? null;
}

export async function upsertUserFromUserJson(data: UserJSON): Promise<void> {
  const primaryEmail = primaryEmailFromUserJson(data);
  const now = new Date();

  await resilientQuery(() =>
    db
      .insert(users)
      .values({
        clerkUserId: data.id,
        clerkUpdatedAtMs: data.updated_at,
        primaryEmail,
        firstName: data.first_name,
        lastName: data.last_name,
        username: data.username,
        imageUrl: data.image_url,
        clerkSnapshot: data,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: users.clerkUserId,
        set: {
          clerkUpdatedAtMs: data.updated_at,
          primaryEmail,
          firstName: data.first_name,
          lastName: data.last_name,
          username: data.username,
          imageUrl: data.image_url,
          clerkSnapshot: data,
          updatedAt: now,
        },
      }),
  );
}

export async function deleteUserByClerkId(clerkUserId: string): Promise<void> {
  await resilientQuery(() => db.delete(users).where(eq(users.clerkUserId, clerkUserId)));
}

/**
 * Throttled sync: compares Clerk `updated_at` with the last snapshot we stored.
 * Uses `currentUser()` (deduped per request). If `raw` is missing, fetches via Backend API once.
 */
export async function syncAuthenticatedUserIfStale(): Promise<void> {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return;

  const user = await currentUser();
  if (!user) return;

  const existing = await resilientQuery(() =>
    db
      .select({ clerkUpdatedAtMs: users.clerkUpdatedAtMs })
      .from(users)
      .where(eq(users.clerkUserId, user.id))
      .limit(1),
  );

  const prev = existing[0]?.clerkUpdatedAtMs ?? null;
  if (prev !== null && prev >= user.updatedAt) return;

  let snapshot = user.raw as UserJSON | null;
  if (!snapshot) {
    const client = await clerkClient();
    const full = await client.users.getUser(user.id);
    snapshot = full.raw as UserJSON | null;
  }
  if (!snapshot) return;

  await upsertUserFromUserJson(snapshot);
}
