import "server-only";

import { eq, sql } from "drizzle-orm";

import { db, resilientQuery } from "@/lib/db";
import { userQuickNotes as userQuickNotesTable } from "@/lib/db/schema";
import {
  QUICK_NOTE_BODY_MAX,
  QUICK_NOTE_TITLE_MAX,
  type UserQuickNote,
} from "@/lib/quick-note/constants";

export class QuickNoteError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "QuickNoteError";
    this.status = status;
  }
}

function normalizeTitle(raw: string): string {
  return raw.replace(/\r\n/g, "\n").trim().slice(0, QUICK_NOTE_TITLE_MAX);
}

function normalizeBody(raw: string): string {
  const body = raw.replace(/\r\n/g, "\n");
  if (body.length > QUICK_NOTE_BODY_MAX) {
    throw new QuickNoteError(
      `Notes are limited to ${QUICK_NOTE_BODY_MAX.toLocaleString()} characters.`,
      400,
    );
  }
  return body;
}

let schemaReady: Promise<void> | null = null;

async function ensureQuickNoteSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    await resilientQuery(() =>
      db.execute(sql`
        CREATE TABLE IF NOT EXISTS user_quick_notes (
          id TEXT PRIMARY KEY,
          user_id VARCHAR(255) NOT NULL,
          title TEXT NOT NULL DEFAULT '',
          body TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `),
    );
    await resilientQuery(() =>
      db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS user_quick_notes_user_id_uniq
        ON user_quick_notes (user_id)
      `),
    );
    await resilientQuery(() =>
      db.execute(sql`
        CREATE INDEX IF NOT EXISTS user_quick_notes_user_id_idx
        ON user_quick_notes (user_id)
      `),
    );
  })().catch((err) => {
    schemaReady = null;
    throw err;
  });
  return schemaReady;
}

export async function getUserQuickNote(userId: string): Promise<UserQuickNote> {
  await ensureQuickNoteSchema();
  const [row] = await resilientQuery(() =>
    db
      .select({
        title: userQuickNotesTable.title,
        body: userQuickNotesTable.body,
        updatedAt: userQuickNotesTable.updatedAt,
      })
      .from(userQuickNotesTable)
      .where(eq(userQuickNotesTable.userId, userId))
      .limit(1),
  );

  if (!row) return { title: "", body: "", updatedAt: null };
  return {
    title: row.title ?? "",
    body: row.body ?? "",
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
  };
}

export async function upsertUserQuickNote(
  userId: string,
  titleRaw: string,
  bodyRaw: string,
): Promise<UserQuickNote> {
  const title = normalizeTitle(titleRaw);
  const body = normalizeBody(bodyRaw);
  await ensureQuickNoteSchema();
  const now = new Date();

  const [existing] = await resilientQuery(() =>
    db
      .select({ id: userQuickNotesTable.id })
      .from(userQuickNotesTable)
      .where(eq(userQuickNotesTable.userId, userId))
      .limit(1),
  );

  if (existing) {
    await resilientQuery(() =>
      db
        .update(userQuickNotesTable)
        .set({ title, body, updatedAt: now })
        .where(eq(userQuickNotesTable.id, existing.id)),
    );
  } else {
    await resilientQuery(() =>
      db.insert(userQuickNotesTable).values({
        userId,
        title,
        body,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }

  return { title, body, updatedAt: now.toISOString() };
}

export async function clearUserQuickNote(userId: string): Promise<void> {
  await ensureQuickNoteSchema();
  await resilientQuery(() =>
    db.delete(userQuickNotesTable).where(eq(userQuickNotesTable.userId, userId)),
  );
}
