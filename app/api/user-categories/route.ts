import { NextRequest, NextResponse } from "next/server";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { userCategories } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { ensureUserCategories } from "@/lib/ensure-user-categories";
import { logServerError } from "@/lib/safe-error";
import { z } from "zod";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * GET — returns the user's full category hierarchy.
 * Auto-clones from system_categories if they have none.
 */
export async function GET() {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    await ensureUserCategories(userId);

    const parent = alias(userCategories, "uc_parent");

    const rows = await resilientQuery(() =>
      db
        .select({
          id: userCategories.id,
          name: userCategories.name,
          slug: userCategories.slug,
          parentId: userCategories.parentId,
          icon: userCategories.icon,
          color: userCategories.color,
          sortOrder: userCategories.sortOrder,
          parentName: parent.name,
          parentColor: parent.color,
        })
        .from(userCategories)
        .leftJoin(parent, eq(userCategories.parentId, parent.id))
        .where(eq(userCategories.userId, userId))
        .orderBy(userCategories.sortOrder),
    );

    // Build hierarchical structure for the UI
    const topLevel = rows.filter((r) => r.parentId == null);
    const hierarchy = topLevel.map((cat) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      icon: cat.icon,
      color: cat.color,
      sortOrder: cat.sortOrder,
      subcategories: rows
        .filter((r) => r.parentId === cat.id)
        .map((sub) => ({
          id: sub.id,
          name: sub.name,
          slug: sub.slug,
          icon: sub.icon,
          color: sub.color,
          sortOrder: sub.sortOrder,
        })),
    }));

    return NextResponse.json({ categories: hierarchy }, { headers: NO_STORE });
  } catch (err) {
    logServerError("api/user-categories/GET", err);
    return NextResponse.json(
      { error: "Failed to load categories", categories: [] },
      { status: 500, headers: NO_STORE },
    );
  }
}

const addSchema = z.object({
  name: z.string().min(1).max(128),
  parentId: z.number().int().optional(),
});

/** POST — add a new category or subcategory. */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const body = await request.json();
    const parsed = addSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400, headers: NO_STORE });
    }

    const slug = parsed.data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    let color: string | undefined;
    let icon: string | undefined;

    if (parsed.data.parentId) {
      const [parentRow] = await resilientQuery(() =>
        db
          .select({ color: userCategories.color })
          .from(userCategories)
          .where(and(eq(userCategories.id, parsed.data.parentId!), eq(userCategories.userId, userId)))
          .limit(1),
      );
      if (!parentRow) {
        return NextResponse.json({ error: "Parent category not found" }, { status: 404, headers: NO_STORE });
      }
      color = parentRow.color ?? undefined;
    }

    // Get max sortOrder for this level
    const maxOrderRows = await resilientQuery(() =>
      db
        .select({ maxOrder: userCategories.sortOrder })
        .from(userCategories)
        .where(
          parsed.data.parentId
            ? and(eq(userCategories.userId, userId), eq(userCategories.parentId, parsed.data.parentId))
            : and(eq(userCategories.userId, userId), isNull(userCategories.parentId)),
        )
        .orderBy(userCategories.sortOrder)
        .limit(1),
    );
    const nextOrder = (maxOrderRows[0]?.maxOrder ?? 0) + 1;

    const [inserted] = await resilientQuery(() =>
      db
        .insert(userCategories)
        .values({
          userId,
          name: parsed.data.name,
          slug: `${slug}-${Date.now().toString(36)}`,
          parentId: parsed.data.parentId ?? null,
          icon: icon ?? null,
          color: color ?? null,
          sortOrder: nextOrder,
        })
        .returning({ id: userCategories.id, name: userCategories.name, slug: userCategories.slug }),
    );

    return NextResponse.json({ category: inserted }, { status: 201, headers: NO_STORE });
  } catch (err) {
    logServerError("api/user-categories/POST", err);
    return NextResponse.json({ error: "Failed to add category" }, { status: 500, headers: NO_STORE });
  }
}

const renameSchema = z.object({
  id: z.number().int(),
  name: z.string().min(1).max(128),
});

/** PUT — rename a category or subcategory. */
export async function PUT(request: NextRequest) {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const body = await request.json();
    const parsed = renameSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400, headers: NO_STORE });
    }

    const result = await resilientQuery(() =>
      db
        .update(userCategories)
        .set({ name: parsed.data.name })
        .where(and(eq(userCategories.id, parsed.data.id), eq(userCategories.userId, userId)))
        .returning({ id: userCategories.id }),
    );

    if (result.length === 0) {
      return NextResponse.json({ error: "Category not found" }, { status: 404, headers: NO_STORE });
    }

    return NextResponse.json({ success: true }, { headers: NO_STORE });
  } catch (err) {
    logServerError("api/user-categories/PUT", err);
    return NextResponse.json({ error: "Failed to rename category" }, { status: 500, headers: NO_STORE });
  }
}

const deleteSchema = z.object({
  id: z.number().int(),
});

/** DELETE — remove a category (and its children if it's a parent). */
export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const body = await request.json();
    const parsed = deleteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400, headers: NO_STORE });
    }

    // Delete children first (FK-safe)
    await resilientQuery(() =>
      db
        .delete(userCategories)
        .where(and(eq(userCategories.parentId, parsed.data.id), eq(userCategories.userId, userId))),
    );

    const result = await resilientQuery(() =>
      db
        .delete(userCategories)
        .where(and(eq(userCategories.id, parsed.data.id), eq(userCategories.userId, userId)))
        .returning({ id: userCategories.id }),
    );

    if (result.length === 0) {
      return NextResponse.json({ error: "Category not found" }, { status: 404, headers: NO_STORE });
    }

    return NextResponse.json({ success: true }, { headers: NO_STORE });
  } catch (err) {
    logServerError("api/user-categories/DELETE", err);
    return NextResponse.json({ error: "Failed to delete category" }, { status: 500, headers: NO_STORE });
  }
}
