"use client";

import {
  useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Pencil, Trash2, Check, X,
  Loader2,
} from "lucide-react";
import type { CategoryFlowTheme } from "@/lib/category-flow-theme";
import { isReservedOtherOutflowCategoryName, isMiscFlow } from "@/lib/reserved-user-categories";
import type { FlowType } from "@/lib/default-categories";
import { FLOW_LABELS, FLOW_TOOLTIPS, FLOW_COLORS } from "@/lib/default-categories";
import {
  CategorySlicer,
  FlowThemeSlicer,
  SubcategoryTypeSlicer,
  SubcategoryTypeInlinePicker,
  type CategorySlicerOption,
} from "@/components/category-slicer";

/* ════════════════════════════════ TYPES ══════════════════════════════════ */

type SubcategoryType = "discretionary" | "semi-discretionary" | "non-discretionary";

interface SubcategoryItem {
  id: number;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  subcategoryType: SubcategoryType | null;
  flowType: FlowType;
}

interface CategoryItem {
  id: number;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  flowType: FlowType;
  subcategories: SubcategoryItem[];
}

/* ════════════════════════════════ HELPERS ═════════════════════════════════ */

const META_FLOW_LABEL: Record<CategoryFlowTheme, string> = {
  inflow: "Inflow",
  outflow: "Outflow",
  savings: "Savings & investments",
  misc: "Misc",
  unknown: "Other",
};

const SUBCAT_FILTER_LABEL: Record<SubcategoryType, string> = {
  "non-discretionary": "Non-discretionary",
  "semi-discretionary": "Semi-discretionary",
  discretionary: "Discretionary",
};

const SUBCAT_TYPE_META: Record<SubcategoryType, { label: string; tip: string; bg: string; text: string; border: string }> = {
  "non-discretionary":  { label: "Non-disc",  tip: "Non-discretionary — essential expense you can't avoid (e.g. rent, insurance, utilities)", bg: "bg-[#EF4444]/10", text: "text-[#FCA5A5]", border: "border-[#EF4444]/25" },
  "semi-discretionary": { label: "Semi-disc", tip: "Semi-discretionary — needed but the amount or frequency is flexible (e.g. groceries, transit)", bg: "bg-[#ECAA0B]/10", text: "text-[#FDE68A]", border: "border-[#ECAA0B]/25" },
  discretionary:        { label: "Discretionary", tip: "Discretionary — fully optional, nice-to-have spending (e.g. dining out, streaming, travel)", bg: "bg-[#22C55E]/10", text: "text-[#86EFAC]", border: "border-[#22C55E]/25" },
};

/** Category Mapping cards only: catch-all subs named like "Other…" render last. */
function sortSubcategoriesOthersLast(subs: SubcategoryItem[]): SubcategoryItem[] {
  return [...subs].sort((a, b) => {
    const aOther = a.name.trim().toLowerCase().startsWith("other");
    const bOther = b.name.trim().toLowerCase().startsWith("other");
    if (aOther !== bOther) return aOther ? 1 : -1;
    const oa = a.sortOrder ?? 0;
    const ob = b.sortOrder ?? 0;
    if (oa !== ob) return oa - ob;
    return a.id - b.id;
  });
}

/** Locked if misc flow OR top-level "Other Outflow" or any subcategory under that parent. */
function isLockedCategory(categories: CategoryItem[], targetId: number): boolean {
  for (const c of categories) {
    if (c.id === targetId && (isMiscFlow(c.flowType) || isReservedOtherOutflowCategoryName(c.name))) return true;
    if ((isMiscFlow(c.flowType) || isReservedOtherOutflowCategoryName(c.name)) && c.subcategories.some((s) => s.id === targetId)) return true;
  }
  return false;
}

function subcategoryPillClasses(
  subcategoryType: SubcategoryType | null,
  isOutflow: boolean,
): string {
  if (isOutflow && subcategoryType) {
    const m = SUBCAT_TYPE_META[subcategoryType];
    return `${m.bg} ${m.text} ${m.border}`;
  }
  return "bg-white/[0.05] text-white/50 border-white/[0.08]";
}

function InlineInput({
  value,
  onSave,
  onCancel,
  color,
  placeholder = "Enter name…",
  /** Parent calls before unmounting (e.g. click-outside runs on mousedown before input blur). */
  flushRef,
}: {
  value: string;
  onSave: (v: string) => void;
  onCancel: () => void;
  color: string;
  placeholder?: string;
  flushRef?: MutableRefObject<(() => void) | null>;
}) {
  const [val, setVal] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  const committed = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => {
      ref.current?.focus();
      ref.current?.select();
    }, 30);
    return () => clearTimeout(t);
  }, []);

  const commit = useCallback(() => {
    if (committed.current) return;
    committed.current = true;
    const trimmed = val.trim();
    if (trimmed && trimmed !== value) onSave(trimmed);
    else onCancel();
  }, [val, value, onSave, onCancel]);

  useLayoutEffect(() => {
    if (!flushRef) return;
    flushRef.current = commit;
    return () => {
      flushRef.current = null;
    };
  }, [flushRef, commit]);

  const onKey = (e: ReactKeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); commit(); }
    if (e.key === "Escape") { e.preventDefault(); onCancel(); }
  };

  return (
    <div className="flex items-center gap-1.5">
      <input
        ref={ref}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={onKey}
        onBlur={commit}
        placeholder={placeholder}
        className="h-7 px-2 rounded-md text-sm bg-white/[0.06] text-white/90 outline-none transition-colors focus:bg-white/[0.10] min-w-[140px] max-w-[280px]"
        style={{ border: `1px solid ${color}40` }}
      />
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); commit(); }}
        className="p-1 rounded hover:bg-white/10 text-emerald-400 transition-colors"
      >
        <Check className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); onCancel(); }}
        className="p-1 rounded hover:bg-white/10 text-white/40 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function NewItemInput({
  color,
  placeholder,
  onSave,
  onCancel,
}: {
  color: string;
  placeholder: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [val, setVal] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const committed = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => ref.current?.focus(), 30);
    return () => clearTimeout(t);
  }, []);

  const commit = () => {
    if (committed.current) return;
    committed.current = true;
    const trimmed = val.trim();
    if (trimmed) onSave(trimmed);
    else onCancel();
  };

  const onKey = (e: ReactKeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); commit(); }
    if (e.key === "Escape") { e.preventDefault(); onCancel(); }
  };

  return (
    <div className="flex items-center gap-1.5">
      <input
        ref={ref}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={onKey}
        onBlur={commit}
        placeholder={placeholder}
        className="h-7 px-2 rounded-md text-sm bg-white/[0.06] text-white/90 outline-none transition-colors focus:bg-white/[0.10] min-w-[140px] max-w-[280px]"
        style={{ border: `1px solid ${color}40` }}
      />
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); commit(); }}
        className="p-1 rounded hover:bg-white/10 text-emerald-400 transition-colors"
      >
        <Check className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); onCancel(); }}
        className="p-1 rounded hover:bg-white/10 text-white/40 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function DeleteConfirm({
  label,
  hasChildren,
  onConfirm,
  onCancel,
}: {
  label: string;
  hasChildren: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 26 }}
        className="w-[340px] rounded-2xl p-6"
        style={{
          background: "rgba(12,12,28,0.96)",
          border: "1px solid rgba(248,70,70,0.25)",
          boxShadow: "0 0 50px rgba(248,70,70,0.08), 0 30px 60px rgba(0,0,0,0.55)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-red-400 mb-2">
          Delete &ldquo;{label}&rdquo;?
        </h3>
        <p className="text-xs text-white/40 mb-5">
          {hasChildren
            ? "This will remove it and all its subcategories."
            : "This action cannot be undone."}
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium rounded-lg text-white/50 hover:text-white/80 hover:bg-white/5 cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-red-500/25 text-red-300 border border-red-500/35 hover:bg-red-500/40 cursor-pointer transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
            Delete
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/** Picker for choosing a flow when adding a new top-level category. Misc is excluded. */
const USER_SELECTABLE_FLOWS: FlowType[] = ["inflow", "outflow", "savings"];

function NewCategoryFlowPicker({ onSelect }: { onSelect: (ft: FlowType) => void }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/[0.08] text-xs text-white/25 transition-colors hover:border-white/[0.15] hover:text-white/50 cursor-pointer"
      >
        <Plus className="w-3.5 h-3.5" />
        Add category
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-white/[0.12] bg-white/[0.04] p-3 space-y-2">
      <p className="text-xs font-medium text-white/50">Pick a flow for the new category</p>
      <div className="flex flex-wrap gap-2">
        {USER_SELECTABLE_FLOWS.map((ft) => (
          <button
            key={ft}
            type="button"
            title={FLOW_TOOLTIPS[ft]}
            onClick={() => { setOpen(false); onSelect(ft); }}
            className="group/flow relative flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:brightness-125 cursor-pointer"
            style={{
              borderColor: `${FLOW_COLORS[ft]}40`,
              background: `${FLOW_COLORS[ft]}15`,
              color: FLOW_COLORS[ft],
            }}
          >
            {FLOW_LABELS[ft]}
            <span className="pointer-events-none absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/90 px-2 py-1 text-[10px] text-white/60 opacity-0 transition-opacity group-hover/flow:opacity-100 z-10">
              {FLOW_TOOLTIPS[ft]}
            </span>
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-[11px] text-white/30 hover:text-white/50 transition-colors cursor-pointer"
      >
        Cancel
      </button>
    </div>
  );
}

/* ═══════════════════════════ MAIN COMPONENT ══════════════════════════════ */

export function CategoryTableManager() {
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  /** Mind-map parent flow (inflow / savings / outflow / other). `null` = all. */
  const [metaFlowFilter, setMetaFlowFilter] = useState<CategoryFlowTheme | null>(null);

  /** `null` = all top-level categories within meta flow; otherwise one parent category. */
  const [flowFilterId, setFlowFilterId] = useState<number | null>(null);

  /** `""` = all subcategory types; otherwise filter outflow subs by type. */
  const [subcategoryTypeFilter, setSubcategoryTypeFilter] = useState<"" | SubcategoryType>("");

  // Editing state
  const [editId, setEditId] = useState<number | null>(null);

  // Adding state — for top-level, stores the selected flow; null = not adding
  const [addingCatFlow, setAddingCatFlow] = useState<FlowType | null>(null);
  const [addingSubParentId, setAddingSubParentId] = useState<number | null>(null);

  /** Subcategory pill opened for in-place name edit + expense-type picker. */
  const [activeSubPillId, setActiveSubPillId] = useState<number | null>(null);
  const activePillPanelRef = useRef<HTMLDivElement | null>(null);
  /** Saves subcategory name before click-outside unmounts the panel (mousedown precedes blur). */
  const subPillCommitFlushRef = useRef<(() => void) | null>(null);

  // Delete confirmation
  const [delConfirm, setDelConfirm] = useState<{
    id: number; label: string; hasChildren: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/user-categories");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setCategories(data.categories ?? []);
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (activeSubPillId == null) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const el = activePillPanelRef.current;
      const t = e.target;
      if (!el || !(t instanceof Node) || el.contains(t)) return;
      subPillCommitFlushRef.current?.();
      setActiveSubPillId(null);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [activeSubPillId]);

  useEffect(() => {
    if (activeSubPillId == null) return;
    if (isLockedCategory(categories, activeSubPillId)) setActiveSubPillId(null);
  }, [activeSubPillId, categories]);

  useEffect(() => {
    if (editId == null) return;
    if (isLockedCategory(categories, editId)) setEditId(null);
  }, [editId, categories]);

  useEffect(() => {
    if (addingSubParentId == null) return;
    const p = categories.find((c) => c.id === addingSubParentId);
    if (p && (isMiscFlow(p.flowType) || isReservedOtherOutflowCategoryName(p.name))) setAddingSubParentId(null);
  }, [addingSubParentId, categories]);

  const metaFilteredParents = useMemo(() => {
    if (metaFlowFilter === null) return categories;
    return categories.filter((c) => c.flowType === metaFlowFilter);
  }, [categories, metaFlowFilter]);

  useEffect(() => {
    if (flowFilterId !== null && !metaFilteredParents.some((c) => c.id === flowFilterId)) {
      setFlowFilterId(null);
    }
  }, [metaFilteredParents, flowFilterId]);

  /** Only outflow subs have expense type — clear type filter for other flows. */
  useEffect(() => {
    if (metaFlowFilter && metaFlowFilter !== "outflow") {
      setSubcategoryTypeFilter("");
    }
  }, [metaFlowFilter]);

  const filteredCategories = useMemo(() => {
    if (flowFilterId === null) return metaFilteredParents;
    return metaFilteredParents.filter((c) => c.id === flowFilterId);
  }, [metaFilteredParents, flowFilterId]);

  const mappingCategorySlicerOptions = useMemo((): CategorySlicerOption[] => {
    let parents = metaFilteredParents;
    if (subcategoryTypeFilter) {
      parents = parents.filter((c) =>
        c.subcategories.some((s) => s.subcategoryType === subcategoryTypeFilter),
      );
    }
    return parents.map((c) => ({
      value: String(c.id),
      label: c.name,
      categoryName: c.name,
      subcategoryName: null,
      flowTheme: c.flowType as CategoryFlowTheme,
    }));
  }, [metaFilteredParents, subcategoryTypeFilter]);

  useEffect(() => {
    if (!subcategoryTypeFilter || flowFilterId === null) return;
    const cat = metaFilteredParents.find((c) => c.id === flowFilterId);
    if (!cat || !cat.subcategories.some((s) => s.subcategoryType === subcategoryTypeFilter)) {
      setFlowFilterId(null);
    }
  }, [subcategoryTypeFilter, flowFilterId, metaFilteredParents]);

  /** Parents and subcategories after flow + category + expense-type filters. */
  const displayCategories = useMemo(() => {
    const withSubs =
      !subcategoryTypeFilter
        ? filteredCategories
        : filteredCategories
            .map((cat) => ({
              ...cat,
              subcategories: cat.subcategories.filter((s) => s.subcategoryType === subcategoryTypeFilter),
            }))
            .filter((cat) => cat.subcategories.length > 0);

    return withSubs.map((cat) => ({
      ...cat,
      subcategories: sortSubcategoriesOthersLast(cat.subcategories),
    }));
  }, [filteredCategories, subcategoryTypeFilter]);

  const onMappingFlowSelect = useCallback((ft: string) => {
    setMetaFlowFilter(ft === "" ? null : (ft as CategoryFlowTheme));
  }, []);

  const onMappingCategorySelect = useCallback((id: string) => {
    if (id === "") {
      setFlowFilterId(null);
      return;
    }
    const num = Number(id);
    if (!Number.isNaN(num)) {
      setFlowFilterId(num);
    }
  }, []);

  const onMappingSubcategoryTypeSelect = useCallback((t: string) => {
    setSubcategoryTypeFilter(t === "" ? "" : (t as SubcategoryType));
  }, []);

  const setSubcategoryType = useCallback(async (id: number, next: SubcategoryType) => {
    if (isLockedCategory(categories, id)) return;
    setCategories((prev) =>
      prev.map((cat) => ({
        ...cat,
        subcategories: cat.subcategories.map((s) =>
          s.id === id ? { ...s, subcategoryType: next } : s,
        ),
      })),
    );
    await fetch("/api/user-categories", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, subcategoryType: next }),
    });
  }, [categories]);

  // CRUD — optimistic-first, then persist in the background.

  const renameCat = useCallback(async (id: number, name: string) => {
    if (isLockedCategory(categories, id)) return;
    setEditId(null);
    setActiveSubPillId(null);

    setCategories((prev) =>
      prev.map((cat) =>
        cat.id === id
          ? { ...cat, name }
          : {
              ...cat,
              subcategories: cat.subcategories.map((s) =>
                s.id === id ? { ...s, name } : s,
              ),
            },
      ),
    );

    try {
      await fetch("/api/user-categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name }),
      });
    } catch { /* optimistic already applied */ }
  }, [categories]);

  const addCategory = useCallback(async (name: string, parentId?: number, flowType?: FlowType) => {
    if (parentId == null && isReservedOtherOutflowCategoryName(name)) return;
    if (parentId != null) {
      const parent = categories.find((c) => c.id === parentId);
      if (parent && (isMiscFlow(parent.flowType) || isReservedOtherOutflowCategoryName(parent.name))) return;
    }

    const resolvedFlow = parentId
      ? categories.find((c) => c.id === parentId)?.flowType ?? "outflow"
      : flowType ?? "outflow";

    setAddingCatFlow(null);
    setAddingSubParentId(null);

    const tempId = -(Date.now() + Math.random());
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`;

    if (parentId) {
      setCategories((prev) =>
        prev.map((cat) =>
          cat.id === parentId
            ? {
                ...cat,
                subcategories: [
                  ...cat.subcategories,
                  { id: tempId, name, slug, icon: null, color: null, sortOrder: cat.subcategories.length + 1, subcategoryType: null, flowType: resolvedFlow },
                ],
              }
            : cat,
        ),
      );
    } else {
      setCategories((prev) => [
        ...prev,
        { id: tempId, name, slug, icon: null, color: null, sortOrder: prev.length + 1, flowType: resolvedFlow, subcategories: [] },
      ]);
    }

    try {
      const bodyPayload: Record<string, unknown> = { name, parentId };
      if (!parentId) bodyPayload.flowType = resolvedFlow;
      const res = await fetch("/api/user-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
      });
      if (res.ok) {
        const data = await res.json();
        const realId = data.category?.[0]?.id ?? data.category?.id;
        if (realId != null) {
          setCategories((prev) =>
            prev.map((cat) => {
              if (cat.id === tempId) return { ...cat, id: realId };
              return {
                ...cat,
                subcategories: cat.subcategories.map((s) =>
                  s.id === tempId ? { ...s, id: realId } : s,
                ),
              };
            }),
          );
        }
      }
    } catch { /* optimistic already applied */ }
  }, [categories]);

  const confirmDelete = useCallback(async () => {
    if (!delConfirm) return;
    const { id } = delConfirm;
    if (isLockedCategory(categories, id)) {
      setDelConfirm(null);
      return;
    }
    setActiveSubPillId(null);
    setDelConfirm(null);

    setCategories((prev) => {
      const isTopLevel = prev.some((c) => c.id === id);
      if (isTopLevel) return prev.filter((c) => c.id !== id);
      return prev.map((cat) => ({
        ...cat,
        subcategories: cat.subcategories.filter((s) => s.id !== id),
      }));
    });

    try {
      // Never send JSON body on DELETE — many stacks drop it; server reads `?id=`.
      const res = await fetch(
        `/api/user-categories?id=${encodeURIComponent(String(id))}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const r = await fetch("/api/user-categories");
        if (r.ok) {
          const data = await r.json();
          setCategories(data.categories ?? []);
        }
      }
    } catch {
      try {
        const r = await fetch("/api/user-categories");
        if (r.ok) {
          const data = await r.json();
          setCategories(data.categories ?? []);
        }
      } catch { /* ignore */ }
    }
  }, [delConfirm, categories]);

  // Stats
  const totalCats = categories.length;
  const totalSubs = categories.reduce((s, c) => s + c.subcategories.length, 0);
  const visibleSubs = displayCategories.reduce((s, c) => s + c.subcategories.length, 0);

  const outflowExpenseSubtypeTotals = useMemo(() => {
    let non = 0;
    let semi = 0;
    let disc = 0;
    for (const cat of categories) {
      if (cat.flowType !== "outflow") continue;
      for (const s of cat.subcategories) {
        if (s.subcategoryType === "non-discretionary") non++;
        else if (s.subcategoryType === "semi-discretionary") semi++;
        else if (s.subcategoryType === "discretionary") disc++;
      }
    }
    return { non, semi, disc };
  }, [categories]);

  const expenseSubtypeSummary = (
    <>
      <span className="text-white/35"> · </span>
      <span className="text-white/40">
        (
        <span className="font-medium tabular-nums text-[#FCA5A5]">{outflowExpenseSubtypeTotals.non}</span>
        {" Non-discretionary, "}
        <span className="font-medium tabular-nums text-[#FDE68A]">{outflowExpenseSubtypeTotals.semi}</span>
        {" Semi-discretionary, "}
        <span className="font-medium tabular-nums text-[#86EFAC]">{outflowExpenseSubtypeTotals.disc}</span>
        {" Discretionary )"}
      </span>
    </>
  );

  if (loading) {
    return (
      <div className="min-h-[60vh] bg-gradient-to-b from-[#08051a] via-[#10082a] to-[#160e35] flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-white/20 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] bg-gradient-to-b from-[#08051a] via-[#10082a] to-[#160e35]">
      <div className="mx-auto max-w-4xl px-4 py-8">
        {/* Flow + expense type slicers — side by side (single row) */}
        <div className="mb-4 flex w-full min-w-0 flex-row flex-wrap items-stretch gap-3">
          <div className="w-max min-w-0 shrink-0">
            <FlowThemeSlicer
              showLabel={false}
              neutralChips
              compact
              selectedFlowTheme={metaFlowFilter ?? ""}
              onSelect={onMappingFlowSelect}
            />
          </div>
          {metaFlowFilter === null || metaFlowFilter === "outflow" ? (
            <div className="w-max min-w-0 shrink-0">
              <SubcategoryTypeSlicer
                showLabel={false}
                compact
                selectedType={subcategoryTypeFilter}
                onSelect={onMappingSubcategoryTypeSelect}
              />
            </div>
          ) : null}
        </div>

        {/* Top-level categories — same slicer as Transactions, no title */}
        <div className="mb-6 w-full min-w-0">
          <CategorySlicer
            showLabel={false}
            neutralChips
            options={mappingCategorySlicerOptions}
            selectedId={flowFilterId === null ? "" : String(flowFilterId)}
            onSelect={onMappingCategorySelect}
          />
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white sm:text-3xl">Category Mapping</h1>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-0 text-sm text-white/50">
              {metaFlowFilter === null && flowFilterId === null && !subcategoryTypeFilter ? (
                <>
                  {totalCats} categories · {totalSubs} subcategories
                  {expenseSubtypeSummary}
                </>
              ) : (
                <>
                  Showing{" "}
                  {metaFlowFilter !== null && (
                    <span className="text-white/70">{META_FLOW_LABEL[metaFlowFilter]}</span>
                  )}
                  {subcategoryTypeFilter ? (
                    <>
                      {metaFlowFilter !== null ? " · " : null}
                      <span className="text-white/70">{SUBCAT_FILTER_LABEL[subcategoryTypeFilter]}</span>
                    </>
                  ) : null}
                  {flowFilterId !== null ? (
                    <>
                      {(metaFlowFilter !== null || subcategoryTypeFilter) ? " · " : null}
                      <span className="text-white/70">
                        {categories.find((c) => c.id === flowFilterId)?.name ?? "—"}
                      </span>
                      {" · "}
                      {displayCategories.find((c) => c.id === flowFilterId)?.subcategories.length ?? 0}{" "}
                      subcategories
                    </>
                  ) : (
                    <>
                      {(metaFlowFilter !== null || subcategoryTypeFilter) ? " — " : null}
                      <span className="text-white/70 tabular-nums">
                        {displayCategories.length} categories · {visibleSubs} subcategories
                      </span>
                    </>
                  )}
                  {expenseSubtypeSummary}
                </>
              )}
            </p>
          </div>
        </div>

        {/* Category sections — 1 col on phones, 2 cols from md when container fits */}
        <div className="grid grid-cols-1 gap-2 sm:gap-3 md:grid-cols-2 md:gap-3">
          {displayCategories.map((cat) => {
            const catColor = cat.color ?? "#808080";
            const isOutflow = cat.flowType === "outflow";
            const cardLocked = isMiscFlow(cat.flowType) || isReservedOtherOutflowCategoryName(cat.name);

            return (
              <div
                key={cat.id}
                className="min-w-0 rounded-xl overflow-hidden border border-white/[0.10] bg-white/[0.04]"
              >
                {/* Category header */}
                <div className="group/cat flex min-h-11 min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5 hover:bg-white/[0.03] transition-colors">
                  {editId === cat.id && !cardLocked ? (
                    <InlineInput
                      value={cat.name}
                      onSave={(name) => renameCat(cat.id, name)}
                      onCancel={() => setEditId(null)}
                      color={catColor}
                    />
                  ) : (
                    <>
                      <span className="min-w-0 truncate text-sm font-medium text-white/80">
                        {cat.name}
                        <span className="font-medium text-white/45 tabular-nums">
                          {" "}
                          ({cat.subcategories.length})
                        </span>
                      </span>
                      {!cardLocked && addingSubParentId !== cat.id ? (
                        <button
                          type="button"
                          onClick={() => setAddingSubParentId(cat.id)}
                          className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-white/25 transition-colors hover:bg-white/[0.06] hover:text-white/50 cursor-pointer"
                          title="Add subcategory"
                        >
                          <Plus className="w-3 h-3" />
                          Add subcategory
                        </button>
                      ) : null}
                      <span className="min-w-2 flex-1" aria-hidden />
                      {!cardLocked ? (
                        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/cat:opacity-100">
                          <button
                            type="button"
                            onClick={() => setEditId(cat.id)}
                            className="p-1 rounded hover:bg-white/10 text-white/25 hover:text-white/60 transition-colors cursor-pointer"
                            title="Rename"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDelConfirm({
                              id: cat.id,
                              label: cat.name,
                              hasChildren: cat.subcategories.length > 0,
                            })}
                            className="p-1 rounded hover:bg-red-500/20 text-white/25 hover:text-red-400 transition-colors cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>

                <div className="px-4 pb-3 pt-1">
                  {cat.subcategories.length > 0 ? (
                    <div className="flex flex-wrap gap-x-1.5 gap-y-2 items-center">
                      {cat.subcategories.map((sub) =>
                        cardLocked ? (
                          <span
                            key={sub.id}
                            title="Built-in category (not editable)"
                            className={[
                              "inline-flex max-w-[200px] cursor-default items-center truncate rounded-full border px-2 py-0.5 text-[11px] text-white/70",
                              subcategoryPillClasses(sub.subcategoryType, isOutflow),
                            ].join(" ")}
                          >
                            {sub.name}
                          </span>
                        ) : activeSubPillId === sub.id ? (
                          <div
                            key={sub.id}
                            ref={activePillPanelRef}
                            className="w-full min-w-0 basis-full rounded-lg border border-white/[0.12] bg-black/20 p-2 space-y-2"
                          >
                            <div className="flex min-w-0 items-start gap-1.5">
                              <div className="min-w-0 flex-1">
                                <InlineInput
                                  flushRef={subPillCommitFlushRef}
                                  value={sub.name}
                                  onSave={(name) => renameCat(sub.id, name)}
                                  onCancel={() => setActiveSubPillId(null)}
                                  color={catColor}
                                />
                              </div>
                              <button
                                type="button"
                                onPointerDown={(e) => {
                                  if (e.pointerType === "mouse" && e.button !== 0) return;
                                  // Same as expense-type chips: avoid input blur → commit/onCancel
                                  // unmounting this row before the click opens delete confirm.
                                  e.preventDefault();
                                }}
                                onClick={() => setDelConfirm({
                                  id: sub.id,
                                  label: sub.name,
                                  hasChildren: false,
                                })}
                                className="shrink-0 rounded p-1.5 text-white/25 hover:bg-red-500/20 hover:text-red-400 transition-colors cursor-pointer"
                                title="Delete subcategory"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            {isOutflow ? (
                              <SubcategoryTypeInlinePicker
                                selected={sub.subcategoryType}
                                onSelect={(t) => setSubcategoryType(sub.id, t)}
                              />
                            ) : null}
                          </div>
                        ) : (
                          <button
                            key={sub.id}
                            type="button"
                            onClick={() => setActiveSubPillId(sub.id)}
                            title="Click to edit name and type"
                            className={[
                              "inline-flex max-w-[200px] items-center truncate rounded-full border px-2 py-0.5 text-[11px] transition-colors hover:brightness-110 cursor-pointer",
                              subcategoryPillClasses(sub.subcategoryType, isOutflow),
                            ].join(" ")}
                          >
                            {sub.name}
                          </button>
                        ),
                      )}
                    </div>
                  ) : null}

                  {!cardLocked && addingSubParentId === cat.id ? (
                    <div className={cat.subcategories.length > 0 ? "mt-2" : "mt-1"}>
                      <NewItemInput
                        color={catColor}
                        placeholder="New subcategory…"
                        onSave={(name) => addCategory(name, cat.id)}
                        onCancel={() => setAddingSubParentId(null)}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}

          {/* Add top-level category — step 1: pick flow, step 2: enter name */}
          {addingCatFlow ? (
            <div className="col-span-full px-4 py-2 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/40">Flow:</span>
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                  style={{ background: `${FLOW_COLORS[addingCatFlow]}25`, color: FLOW_COLORS[addingCatFlow] }}
                >
                  {FLOW_LABELS[addingCatFlow]}
                </span>
              </div>
              <NewItemInput
                color={FLOW_COLORS[addingCatFlow]}
                placeholder="New category…"
                onSave={(name) => addCategory(name, undefined, addingCatFlow)}
                onCancel={() => setAddingCatFlow(null)}
              />
            </div>
          ) : (
            <div className="col-span-full">
              <NewCategoryFlowPicker onSelect={(ft) => setAddingCatFlow(ft)} />
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation modal */}
      <AnimatePresence>
        {delConfirm && (
          <DeleteConfirm
            label={delConfirm.label}
            hasChildren={delConfirm.hasChildren}
            onConfirm={confirmDelete}
            onCancel={() => setDelConfirm(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
