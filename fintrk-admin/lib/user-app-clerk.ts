/** Clerk secret for the FinTRK *user* app instance (not the admin Clerk). */
export function userAppClerkSecret(): string | null {
  return (
    process.env.USER_APP_CLERK_SECRET_KEY?.trim() ||
    process.env.CLERK_SECRET_KEY?.trim() ||
    null
  );
}

export const CLERK_API_BASE = "https://api.clerk.com/v1";

export type ClerkListUser = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  image_url: string | null;
  created_at: number;
  last_sign_in_at: number | null;
  primary_email_address_id: string | null;
  email_addresses?: Array<{ id: string; email_address: string }>;
  public_metadata?: Record<string, unknown>;
};

export function pickClerkEmail(user: ClerkListUser): string | null {
  const list = user.email_addresses ?? [];
  if (user.primary_email_address_id) {
    const primary = list.find((e) => e.id === user.primary_email_address_id);
    if (primary?.email_address) return primary.email_address;
  }
  return list[0]?.email_address ?? null;
}

export function pickClerkName(user: ClerkListUser, email: string | null): string {
  const full = [user.first_name, user.last_name]
    .filter((p): p is string => Boolean(p && p.trim()))
    .join(" ")
    .trim();
  if (full) return full;
  if (user.username?.trim()) return user.username.trim();
  if (email) return email.split("@")[0] ?? email;
  return user.id;
}
