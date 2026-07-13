import type { UserQuickNote } from "@/lib/quick-note/constants";

async function readError(res: Response, fallback: string): Promise<string> {
  const j = (await res.json().catch(() => ({}))) as { error?: string };
  return j.error ?? fallback;
}

export async function fetchUserQuickNote(): Promise<UserQuickNote | null> {
  const res = await fetch("/api/quick-note", { cache: "no-store" });
  if (res.status === 401 || res.status === 503) return null;
  if (!res.ok) throw new Error(await readError(res, "Could not load note"));
  const body = (await res.json()) as { note?: UserQuickNote };
  return body.note ?? { title: "", body: "", updatedAt: null };
}

export async function saveUserQuickNote(
  title: string,
  body: string,
): Promise<UserQuickNote> {
  const res = await fetch("/api/quick-note", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, body }),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not save note"));
  const payload = (await res.json()) as { note: UserQuickNote };
  return payload.note;
}

export async function clearUserQuickNoteRemote(): Promise<void> {
  const res = await fetch("/api/quick-note", { method: "DELETE" });
  if (res.status === 404) return;
  if (!res.ok) throw new Error(await readError(res, "Could not clear note"));
}
