"use client";

import {
  useState, useRef, useEffect, useCallback, useMemo,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight, ChevronDown,
  Plus, Pencil, Trash2, Check, X,
  Store, Loader2,
} from "lucide-react";
import { FINTRK_TRANSACTIONS_CHANGED } from "@/lib/notify-transactions-changed";
import {
  flowThemeForCategoryNames,
  type CategoryFlowTheme,
} from "@/lib/category-flow-theme";

/* ════════════════════════════════ TYPES ══════════════════════════════════ */

interface SubcategoryItem {
  id: number;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
  sortOrder: number;
}

interface CategoryItem {
  id: number;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  subcategories: SubcategoryItem[];
}

/* ════════════════════════════════ HELPERS ═════════════════════════════════ */

function cnPill(active: boolean) {
  return [
    "inline-flex items-center rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors cursor-pointer shrink-0",
    active
      ? "bg-[#0BC18D]/20 text-[#0BC18D]"
      : "text-white/45 hover:bg-white/[0.06] hover:text-white/70",
  ].join(" ");
}

const META_FLOW_ORDER: CategoryFlowTheme[] = ["inflow", "savings", "outflow", "unknown"];
const META_FLOW_LABEL: Record<CategoryFlowTheme, string> = {
  inflow: "Inflow",
  savings: "Savings & investments",
  outflow: "Outflow",
  unknown: "Other",
};

function cnMetaFlowPill(active: boolean, theme: "all" | CategoryFlowTheme) {
  const base =
    "inline-flex items-center rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors cursor-pointer shrink-0";
  if (theme === "all") {
    return [
      base,
      active
        ? "bg-[#0BC18D]/20 text-[#0BC18D]"
        : "text-white/45 hover:bg-white/[0.06] hover:text-white/70",
    ].join(" ");
  }
  const themed = {
    inflow: active
      ? "bg-[#22C55E]/20 text-[#4ADE80] ring-1 ring-[#22C55E]/35"
      : "text-white/45 hover:bg-[#22C55E]/10 hover:text-white/75",
    savings: active
      ? "bg-[#9333EA]/20 text-[#C084FC] ring-1 ring-[#9333EA]/35"
      : "text-white/45 hover:bg-[#9333EA]/10 hover:text-white/75",
    outflow: active
      ? "bg-[#EF4444]/18 text-[#FCA5A5] ring-1 ring-[#EF4444]/35"
      : "text-white/45 hover:bg-[#EF4444]/10 hover:text-white/75",
    unknown: active
      ? "bg-white/[0.10] text-white/90 ring-1 ring-white/20"
      : "text-white/45 hover:bg-white/[0.06] hover:text-white/70",
  }[theme];
  return `${base} ${themed}`;
}

function InlineInput({
  value,
  onSave,
  onCancel,
  color,
  placeholder = "Enter name…",
}: {
  value: string;
  onSave: (v: string) => void;
  onCancel: () => void;
  color: string;
  placeholder?: string;
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

  const commit = () => {
    if (committed.current) return;
    committed.current = true;
    const trimmed = val.trim();
    if (trimmed && trimmed !== value) onSave(trimmed);
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

/* ═══════════════════════════ MAIN COMPONENT ══════════════════════════════ */

export function CategoryTableManager() {
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  /** Mind-map parent flow (inflow / savings / outflow / other). `null` = all. */
  const [metaFlowFilter, setMetaFlowFilter] = useState<CategoryFlowTheme | null>(null);

  /** `null` = all top-level categories within meta flow; otherwise one parent category. */
  const [flowFilterId, setFlowFilterId] = useState<number | null>(null);

  // Expand state
  const [expandedCats, setExpandedCats] = useState<Set<number>>(new Set());

  // Editing state
  const [editId, setEditId] = useState<number | null>(null);

  // Adding state
  const [addingCatParent, setAddingCatParent] = useState(false);
  const [addingSubParentId, setAddingSubParentId] = useState<number | null>(null);

  // Delete confirmation
  const [delConfirm, setDelConfirm] = useState<{
    id: number; label: string; hasChildren: boolean;
  } | null>(null);

  // Merchants by subcategory
  const [merchantMap, setMerchantMap] = useState<Record<string, string[]>>({});

  const loadCategories = useCallback(async () => {
    try {
      const res = await fetch("/api/user-categories");
      if (!res.ok) return;
      const data = await res.json();
      setCategories(data.categories ?? []);
      if (loading) {
        setExpandedCats(new Set((data.categories ?? []).map((c: CategoryItem) => c.id)));
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [loading]);

  const loadMerchants = useCallback(async () => {
    try {
      const res = await fetch("/api/categories/merchants");
      if (!res.ok) return;
      const data = await res.json();
      setMerchantMap(data.merchants ?? {});
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadCategories();
    loadMerchants();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onTxn = () => { loadMerchants(); };
    window.addEventListener(FINTRK_TRANSACTIONS_CHANGED, onTxn);
    return () => window.removeEventListener(FINTRK_TRANSACTIONS_CHANGED, onTxn);
  }, [loadMerchants]);

  const metaFilteredParents = useMemo(() => {
    if (metaFlowFilter === null) return categories;
    return categories.filter(
      (c) => flowThemeForCategoryNames(null, c.name) === metaFlowFilter,
    );
  }, [categories, metaFlowFilter]);

  useEffect(() => {
    if (flowFilterId !== null && !metaFilteredParents.some((c) => c.id === flowFilterId)) {
      setFlowFilterId(null);
    }
  }, [metaFilteredParents, flowFilterId]);

  const filteredCategories = useMemo(() => {
    if (flowFilterId === null) return metaFilteredParents;
    return metaFilteredParents.filter((c) => c.id === flowFilterId);
  }, [metaFilteredParents, flowFilterId]);

  const selectMetaFlow = useCallback((theme: CategoryFlowTheme | null) => {
    setMetaFlowFilter(theme);
  }, []);

  const selectFlow = useCallback((id: number | null) => {
    setFlowFilterId(id);
    if (id !== null) {
      setExpandedCats((p) => new Set(p).add(id));
    }
  }, []);

  // Toggle helpers
  const toggleCat = useCallback((id: number) => {
    setExpandedCats((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedCats(new Set(filteredCategories.map((c) => c.id)));
  }, [filteredCategories]);

  const collapseAll = useCallback(() => {
    setExpandedCats(new Set());
  }, []);

  // CRUD via API
  const renameCat = useCallback(async (id: number, name: string) => {
    setEditId(null);
    await fetch("/api/user-categories", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name }),
    });
    await loadCategories();
  }, [loadCategories]);

  const addCategory = useCallback(async (name: string, parentId?: number) => {
    setAddingCatParent(false);
    setAddingSubParentId(null);
    await fetch("/api/user-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parentId }),
    });
    await loadCategories();
    if (parentId) setExpandedCats((p) => new Set(p).add(parentId));
  }, [loadCategories]);

  const confirmDelete = useCallback(async () => {
    if (!delConfirm) return;
    await fetch("/api/user-categories", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: delConfirm.id }),
    });
    setDelConfirm(null);
    await loadCategories();
  }, [delConfirm, loadCategories]);

  // Stats
  const totalCats = categories.length;
  const totalSubs = categories.reduce((s, c) => s + c.subcategories.length, 0);
  const visibleSubs = filteredCategories.reduce((s, c) => s + c.subcategories.length, 0);

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
        {/* Parent flow (Inflow / Savings / Outflow / Other) */}
        <div className="flex justify-center mb-4">
          <div
            role="tablist"
            aria-label="Filter by parent flow"
            className="flex flex-wrap items-center justify-center gap-1.5 rounded-full border border-white/[0.10] bg-white/[0.03] p-1 max-w-full"
          >
            <button
              type="button"
              role="tab"
              aria-selected={metaFlowFilter === null}
              onClick={() => selectMetaFlow(null)}
              className={cnMetaFlowPill(metaFlowFilter === null, "all")}
            >
              All flows
            </button>
            {META_FLOW_ORDER.map((theme) => {
              const active = metaFlowFilter === theme;
              return (
                <button
                  key={theme}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => selectMetaFlow(active ? null : theme)}
                  className={cnMetaFlowPill(active, theme)}
                >
                  {META_FLOW_LABEL[theme]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Top-level category slicer (within selected parent flow) */}
        <div className="flex justify-center mb-6">
          <div
            role="tablist"
            aria-label="Filter by category"
            className="flex flex-wrap items-center justify-center gap-1.5 rounded-full border border-white/[0.10] bg-white/[0.03] p-1 max-w-full"
          >
            <button
              type="button"
              role="tab"
              aria-selected={flowFilterId === null}
              onClick={() => selectFlow(null)}
              className={cnPill(flowFilterId === null)}
            >
              All
            </button>
            {metaFilteredParents.map((flow) => {
              const active = flowFilterId === flow.id;
              return (
                <button
                  key={flow.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => selectFlow(flow.id)}
                  className={cnPill(active)}
                >
                  <span
                    className="mr-1.5 inline-block size-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: flow.color ?? "#808080" }}
                    aria-hidden
                  />
                  {flow.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white sm:text-3xl">Category Mapping</h1>
            <p className="text-sm text-white/50 mt-1">
              {metaFlowFilter === null && flowFilterId === null ? (
                <>
                  {totalCats} categories · {totalSubs} subcategories
                </>
              ) : (
                <>
                  Showing{" "}
                  {metaFlowFilter !== null && (
                    <span className="text-white/70">{META_FLOW_LABEL[metaFlowFilter]}</span>
                  )}
                  {flowFilterId !== null ? (
                    <>
                      {metaFlowFilter !== null ? " · " : null}
                      <span className="text-white/70">
                        {categories.find((c) => c.id === flowFilterId)?.name ?? "—"}
                      </span>
                      {" · "}
                      {categories.find((c) => c.id === flowFilterId)?.subcategories.length ?? 0}{" "}
                      subcategories
                    </>
                  ) : (
                    <>
                      {metaFlowFilter !== null ? " — " : null}
                      <span className="text-white/70 tabular-nums">
                        {filteredCategories.length} categories · {visibleSubs} subcategories
                      </span>
                    </>
                  )}
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={expandAll}
              className="px-3 py-1.5 text-xs font-medium rounded-lg text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-colors cursor-pointer"
            >
              Expand all
            </button>
            <button
              type="button"
              onClick={collapseAll}
              className="px-3 py-1.5 text-xs font-medium rounded-lg text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-colors cursor-pointer"
            >
              Collapse all
            </button>
          </div>
        </div>

        {/* Category sections */}
        <div className="space-y-1">
          {filteredCategories.map((cat) => {
            const catExpanded = expandedCats.has(cat.id);
            const catColor = cat.color ?? "#808080";

            return (
              <div
                key={cat.id}
                className="rounded-xl overflow-hidden border border-white/[0.10] bg-white/[0.04]"
              >
                {/* Category header */}
                <div className="group/cat flex items-center h-11 px-4 hover:bg-white/[0.03] transition-colors">
                  <button
                    type="button"
                    onClick={() => toggleCat(cat.id)}
                    className="p-0.5 mr-2 rounded hover:bg-white/10 text-white/30 hover:text-white/60 transition-colors shrink-0 cursor-pointer"
                  >
                    {catExpanded
                      ? <ChevronDown className="w-3.5 h-3.5" />
                      : <ChevronRight className="w-3.5 h-3.5" />}
                  </button>

                  <div
                    className="w-2 h-2 rounded-full mr-3 shrink-0"
                    style={{ backgroundColor: catColor }}
                  />

                  {editId === cat.id ? (
                    <InlineInput
                      value={cat.name}
                      onSave={(name) => renameCat(cat.id, name)}
                      onCancel={() => setEditId(null)}
                      color={catColor}
                    />
                  ) : (
                    <>
                      <span className="text-sm font-medium text-white/80 flex-1 truncate">
                        {cat.name}
                      </span>
                      <span className="text-[11px] text-white/20 tabular-nums mr-3 shrink-0">
                        {cat.subcategories.length}
                      </span>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover/cat:opacity-100 transition-opacity shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setAddingSubParentId(cat.id);
                            setExpandedCats((p) => new Set(p).add(cat.id));
                          }}
                          className="p-1 rounded hover:bg-white/10 text-white/25 hover:text-white/60 transition-colors cursor-pointer"
                          title="Add subcategory"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
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
                    </>
                  )}
                </div>

                {/* Subcategories */}
                <AnimatePresence>
                  {catExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      <div className="border-t" style={{ borderColor: `${catColor}10` }}>
                        {cat.subcategories.map((sub) => {
                          const isEditingSub = editId === sub.id;
                          const subMerchants = merchantMap[sub.name.toLowerCase()] ?? [];
                          return (
                            <div key={sub.id}>
                              <div className="group/sub flex items-center h-9 pl-12 pr-3 hover:bg-white/[0.025] transition-colors">
                                <div
                                  className="w-1.5 h-1.5 rounded-full mr-3 shrink-0"
                                  style={{ backgroundColor: `${catColor}50` }}
                                />
                                {isEditingSub ? (
                                  <InlineInput
                                    value={sub.name}
                                    onSave={(name) => renameCat(sub.id, name)}
                                    onCancel={() => setEditId(null)}
                                    color={catColor}
                                  />
                                ) : (
                                  <>
                                    <span className="text-[13px] text-white/55 flex-1 truncate">
                                      {sub.name}
                                    </span>
                                    <div className="flex items-center gap-0.5 opacity-0 group-hover/sub:opacity-100 transition-opacity shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => setEditId(sub.id)}
                                        className="p-1 rounded hover:bg-white/10 text-white/25 hover:text-white/60 transition-colors cursor-pointer"
                                        title="Rename"
                                      >
                                        <Pencil className="w-3 h-3" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setDelConfirm({
                                          id: sub.id,
                                          label: sub.name,
                                          hasChildren: false,
                                        })}
                                        className="p-1 rounded hover:bg-red-500/20 text-white/25 hover:text-red-400 transition-colors cursor-pointer"
                                        title="Delete"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                              {subMerchants.length > 0 && (
                                <div className="ml-[3.75rem] mr-3 mb-1.5 mt-0.5 rounded-lg bg-white/[0.025] border border-white/[0.06] px-2.5 py-2">
                                  <div className="flex items-center gap-1.5 mb-1.5">
                                    <Store className="w-3 h-3 text-white/20" />
                                    <span className="text-[10px] font-medium text-white/25 uppercase tracking-wider">Merchants</span>
                                  </div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {subMerchants.map((m) => (
                                      <span
                                        key={m}
                                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] text-white/50 bg-white/[0.05] border border-white/[0.08] truncate max-w-[180px]"
                                      >
                                        {m}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {addingSubParentId === cat.id ? (
                          <div className="pl-12 pr-3 py-1.5">
                            <NewItemInput
                              color={catColor}
                              placeholder="New subcategory…"
                              onSave={(name) => addCategory(name, cat.id)}
                              onCancel={() => setAddingSubParentId(null)}
                            />
                          </div>
                        ) : cat.subcategories.length === 0 ? (
                          <button
                            type="button"
                            onClick={() => setAddingSubParentId(cat.id)}
                            className="flex items-center h-8 pl-12 pr-3 text-[11px] text-white/20 hover:text-white/45 transition-colors gap-1 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                            Add subcategory
                          </button>
                        ) : null}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}

          {/* Add top-level category */}
          {addingCatParent ? (
            <div className="px-4 py-2">
              <NewItemInput
                color="#808080"
                placeholder="New category…"
                onSave={(name) => addCategory(name)}
                onCancel={() => setAddingCatParent(false)}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingCatParent(true)}
              className="w-full flex items-center justify-center h-10 rounded-xl border border-dashed border-white/[0.08] text-xs text-white/25 hover:text-white/50 hover:border-white/[0.15] transition-colors gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add category
            </button>
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
