import { NextRequest, NextResponse } from "next/server";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import {
  userCategories,
  transactions,
  merchants,
  categoryRules,
  recurringPatterns,
  budgets,
} from "@/lib/db/schema";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { ensureUserCategories } from "@/lib/ensure-user-categories";
import { isReservedOtherOutflowCategoryName, isMiscFlow } from "@/lib/reserved-user-categories";
import { logServerError } from "@/lib/safe-error";
import { z } from "zod";
import type { FlowType } from "@/lib/default-categories";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

type UserCategoryRow = { name: string; parentId: number | null; flowType: FlowType };

/** Locked if misc flow OR top-level "Other Outflow" or any descendant under that parent. */
async function userCategoryRowLocked(userId: string, row: UserCategoryRow): Promise<boolean> {
  if (isMiscFlow(row.flowType)) return true;
  if (row.parentId == null) {
    return isReservedOtherOutflowCategoryName(row.name);
  }
  let pid: number | null = row.parentId;
  while (pid != null) {
    const [p] = await resilientQuery(() =>
      db
        .select({ name: userCategories.name, parentId: userCategories.parentId, flowType: userCategories.flowType })
        .from(userCategories)
        .where(and(eq(userCategories.id, pid), eq(userCategories.userId, userId)))
        .limit(1),
    );
    if (!p) return false;
    if (isMiscFlow(p.flowType)) return true;
    if (p.parentId == null && isReservedOtherOutflowCategoryName(p.name)) return true;
    pid = p.parentId;
  }
  return false;
}

async function userCategoryLockedById(userId: string, id: number): Promise<boolean> {
  const [row] = await resilientQuery(() =>
    db
      .select({ name: userCategories.name, parentId: userCategories.parentId, flowType: userCategories.flowType })
      .from(userCategories)
      .where(and(eq(userCategories.id, id), eq(userCategories.userId, userId)))
      .limit(1),
  );
  if (!row) return false;
  return userCategoryRowLocked(userId, row);
}

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
          subcategoryType: userCategories.subcategoryType,
          flowType: userCategories.flowType,
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
      flowType: cat.flowType,
      subcategories: rows
        .filter((r) => r.parentId === cat.id)
        .map((sub) => ({
          id: sub.id,
          name: sub.name,
          slug: sub.slug,
          icon: sub.icon,
          color: sub.color,
          sortOrder: sub.sortOrder,
          subcategoryType: sub.subcategoryType,
          flowType: sub.flowType,
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
  flowType: z.enum(["inflow", "outflow", "savings"]).optional(),
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

    if (parsed.data.parentId == null && isReservedOtherOutflowCategoryName(parsed.data.name)) {
      return NextResponse.json({ error: "Reserved category" }, { status: 403, headers: NO_STORE });
    }

    // Top-level categories MUST specify a flow (and misc is not allowed)
    if (parsed.data.parentId == null && !parsed.data.flowType) {
      return NextResponse.json({ error: "flowType is required for top-level categories" }, { status: 400, headers: NO_STORE });
    }

    const slug = parsed.data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    let color: string | undefined;
    let icon: string | undefined;
    let resolvedFlowType: FlowType;

    if (parsed.data.parentId) {
      const [parentRow] = await resilientQuery(() =>
        db
          .select({ color: userCategories.color, name: userCategories.name, parentId: userCategories.parentId, flowType: userCategories.flowType })
          .from(userCategories)
          .where(and(eq(userCategories.id, parsed.data.parentId!), eq(userCategories.userId, userId)))
          .limit(1),
      );
      if (!parentRow) {
        return NextResponse.json({ error: "Parent category not found" }, { status: 404, headers: NO_STORE });
      }
      if (await userCategoryRowLocked(userId, { name: parentRow.name, parentId: parentRow.parentId, flowType: parentRow.flowType })) {
        return NextResponse.json({ error: "Reserved category" }, { status: 403, headers: NO_STORE });
      }
      color = parentRow.color ?? undefined;
      resolvedFlowType = parentRow.flowType;
    } else {
      resolvedFlowType = parsed.data.flowType!;
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
          flowType: resolvedFlowType,
        })
        .returning({ id: userCategories.id, name: userCategories.name, slug: userCategories.slug }),
    );

    return NextResponse.json({ category: inserted }, { status: 201, headers: NO_STORE });
  } catch (err) {
    logServerError("api/user-categories/POST", err);
    return NextResponse.json({ error: "Failed to add category" }, { status: 500, headers: NO_STORE });
  }
}

const updateSchema = z.object({
  id: z.number().int(),
  name: z.string().min(1).max(128).optional(),
  subcategoryType: z.enum(["discretionary", "semi-discretionary", "non-discretionary"]).nullable().optional(),
}).refine((d) => d.name !== undefined || d.subcategoryType !== undefined, {
  message: "Provide name and/or subcategoryType",
});

/** PUT — update a category or subcategory (rename and/or change subcategoryType). */
export async function PUT(request: NextRequest) {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400, headers: NO_STORE });
    }

    const [existing] = await resilientQuery(() =>
      db
        .select({ name: userCategories.name, parentId: userCategories.parentId, flowType: userCategories.flowType })
        .from(userCategories)
        .where(and(eq(userCategories.id, parsed.data.id), eq(userCategories.userId, userId)))
        .limit(1),
    );
    if (!existing) {
      return NextResponse.json({ error: "Category not found" }, { status: 404, headers: NO_STORE });
    }

    if (await userCategoryRowLocked(userId, existing)) {
      return NextResponse.json({ error: "Reserved category" }, { status: 403, headers: NO_STORE });
    }

    if (
      parsed.data.name !== undefined &&
      isReservedOtherOutflowCategoryName(parsed.data.name) &&
      !isReservedOtherOutflowCategoryName(existing.name)
    ) {
      return NextResponse.json({ error: "Reserved category name" }, { status: 403, headers: NO_STORE });
    }

    const setPayload: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) setPayload.name = parsed.data.name;
    if (parsed.data.subcategoryType !== undefined) setPayload.subcategoryType = parsed.data.subcategoryType;

    const result = await resilientQuery(() =>
      db
        .update(userCategories)
        .set(setPayload)
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

/** Clear FKs pointing at these user_categories rows so DELETE does not fail silently. */
async function detachUserCategoryReferences(userId: string, categoryIds: number[]) {
  const ids = [...new Set(categoryIds)].filter((n) => Number.isInteger(n));
  if (ids.length === 0) return;

  await resilientQuery(() =>
    db
      .update(transactions)
      .set({ categoryId: null, updatedAt: new Date() })
      .where(and(eq(transactions.userId, userId), inArray(transactions.categoryId, ids))),
  );
  await resilientQuery(() =>
    db
      .update(budgets)
      .set({ categoryId: null, updatedAt: new Date() })
      .where(and(eq(budgets.userId, userId), inArray(budgets.categoryId, ids))),
  );
  await resilientQuery(() =>
    db
      .update(recurringPatterns)
      .set({ categoryId: null, updatedAt: new Date() })
      .where(and(eq(recurringPatterns.userId, userId), inArray(recurringPatterns.categoryId, ids))),
  );
  await resilientQuery(() =>
    db.update(merchants).set({ categoryId: null }).where(inArray(merchants.categoryId, ids)),
  );
  await resilientQuery(() =>
    db.delete(categoryRules).where(inArray(categoryRules.categoryId, ids)),
  );
}

/** DELETE — remove a category (and its children if it's a parent). */
export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    // Prefer `?id=` — DELETE request bodies are often stripped by browsers/CDNs/proxies.
    const q = request.nextUrl.searchParams.get("id");
    let id: number;
    if (q != null && q !== "") {
      const n = Number(q);
      if (!Number.isInteger(n)) {
        return NextResponse.json({ error: "Invalid input" }, { status: 400, headers: NO_STORE });
      }
      id = n;
    } else {
      const body = await request.json().catch(() => ({}));
      const parsed = deleteSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid input" }, { status: 400, headers: NO_STORE });
      }
      id = parsed.data.id;
    }

    const [owned] = await resilientQuery(() =>
      db
        .select({ id: userCategories.id })
        .from(userCategories)
        .where(and(eq(userCategories.id, id), eq(userCategories.userId, userId)))
        .limit(1),
    );
    if (!owned) {
      return NextResponse.json({ error: "Category not found" }, { status: 404, headers: NO_STORE });
    }

    if (await userCategoryLockedById(userId, id)) {
      return NextResponse.json({ error: "Reserved category" }, { status: 403, headers: NO_STORE });
    }

    const childRows = await resilientQuery(() =>
      db
        .select({ id: userCategories.id })
        .from(userCategories)
        .where(and(eq(userCategories.parentId, id), eq(userCategories.userId, userId))),
    );
    const idsToDetach = [id, ...childRows.map((r) => r.id)];
    await detachUserCategoryReferences(userId, idsToDetach);

    // Delete children first (FK-safe for user_categories self-FK)
    await resilientQuery(() =>
      db
        .delete(userCategories)
        .where(and(eq(userCategories.parentId, id), eq(userCategories.userId, userId))),
    );

    const result = await resilientQuery(() =>
      db
        .delete(userCategories)
        .where(and(eq(userCategories.id, id), eq(userCategories.userId, userId)))
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
