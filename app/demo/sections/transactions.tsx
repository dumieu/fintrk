"use client";

import { useMemo, useState } from "react";
import {
  Search,
  Plus,
  Trash2,
  Pencil,
  Globe,
  X,
  Save,
  ListFilter,
} from "lucide-react";
import { useDemo, useDemoSnapshot, type DemoTransaction } from "../demo-store";
import { accountById, categoryById, categoryPicker, filterTransactions, num } from "../derived";
import { formatCurrency } from "@/lib/format";

const PAGE_SIZE = 25;

export function DemoTransactionsSection() {
  const snap = useDemoSnapshot();
  const { dispatch, toast } = useDemo();
  const [q, setQ] = useState("");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [flow, setFlow] = useState<"all" | "in" | "out">("all");
  const [editing, setEditing] = useState<DemoTransaction | null>(null);
  const [adding, setAdding] = useState(false);
  const [page, setPage] = useState(0);

  const filtered = useMemo(
    () => filterTransactions(snap, { q, accountId, categoryId, flow }),
    [snap, q, accountId, categoryId, flow],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const slice = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const acctMap = accountById(snap);

  const handleDelete = (t: DemoTransaction) => {
    dispatch({ type: "DELETE_TXN", id: t.id });
    toast(`Removed ${t.merchant_name ?? "transaction"} (demo only)`, "warn");
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white">Transactions</h2>
          <p className="text-[11px] text-white/55">
            {filtered.length.toLocaleString()} matching · click any row to edit · changes never persist
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#0BC18D] to-[#2CA2FF] px-3 py-1.5 text-[11px] font-semibold text-white shadow-lg shadow-[#0BC18D]/20"
        >
          <Plus className="h-3.5 w-3.5" /> Add transaction
        </button>
      </div>

      {/* Filter bar */}
      <div className="mt-5 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(0); }}
            placeholder="Search merchant, description, category…"
            className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-xs text-white placeholder-white/40 focus:border-[#2CA2FF]/50 focus:outline-none"
          />
        </div>
        <Select
          value={accountId ?? ""}
          onChange={(v) => { setAccountId(v || null); setPage(0); }}
          placeholder="All accounts"
        >
          {snap.accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.account_name}</option>
          ))}
        </Select>
        <Select
          value={categoryId?.toString() ?? ""}
          onChange={(v) => { setCategoryId(v ? Number(v) : null); setPage(0); }}
          placeholder="All categories"
        >
          {categoryPicker(snap).map((c) => (
            <option key={c.id} value={c.id}>{c.parentName} · {c.name}</option>
          ))}
        </Select>
        <div className="inline-flex rounded-lg border border-white/10 bg-white/5 p-0.5">
          {(["all", "in", "out"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => { setFlow(f); setPage(0); }}
              className={`px-3 py-1 text-[10px] font-medium ${flow === f ? "rounded bg-white/15 text-white" : "text-white/55 hover:text-white/85"}`}
            >
              {f === "all" ? "All" : f === "in" ? "Income" : "Outflow"}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
        <div className="grid grid-cols-12 gap-2 border-b border-white/10 bg-white/[0.03] px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-white/55">
          <div className="col-span-2">Date</div>
          <div className="col-span-4">Merchant</div>
          <div className="col-span-3">Category</div>
          <div className="col-span-2 text-right">Amount</div>
          <div className="col-span-1 text-right">·</div>
        </div>
        <div className="divide-y divide-white/5 max-h-[520px] overflow-y-auto">
          {slice.map((t) => {
            const a = num(t.base_amount);
            const isInflow = t.flow_type === "inflow" || a > 0;
            const acct = acctMap.get(t.account_id);
            return (
              <div key={t.id} className="group grid grid-cols-12 items-center gap-2 px-4 py-2.5 text-[12px] hover:bg-white/[0.03]">
                <div className="col-span-2 text-white/55 tabular-nums">{t.posted_date}</div>
                <div className="col-span-4 min-w-0">
                  <div className="truncate font-medium text-white/90">{t.merchant_name ?? t.raw_description}</div>
                  <div className="truncate text-[10px] text-white/40">
                    {acct?.account_name ?? "—"}
                    {t.country_iso && t.country_iso !== "US" && (
                      <span className="ml-1 inline-flex items-center gap-0.5 text-[#AD74FF]">
                        <Globe className="h-2.5 w-2.5" /> {t.country_iso}
                      </span>
                    )}
                  </div>
                </div>
                <div className="col-span-3 min-w-0">
                  {t.category_name && (
                    <span
                      className="inline-block max-w-full truncate rounded-md px-2 py-0.5 text-[10px] font-medium"
                      style={{
                        background: `${t.category_color ?? "#666"}20`,
                        color: t.category_color ?? "#aaa",
                      }}
                    >
                      {t.category_name}
                    </span>
                  )}
                </div>
                <div className={`col-span-2 text-right font-bold tabular-nums ${isInflow ? "text-[#0BC18D]" : "text-white/90"}`}>
                  {isInflow ? "+" : "−"}{formatCurrency(Math.abs(a), t.base_currency)}
                </div>
                <div className="col-span-1 flex justify-end gap-1 opacity-0 transition group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => setEditing(t)}
                    className="rounded p-1 text-white/45 hover:bg-white/10 hover:text-white"
                    title="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(t)}
                    className="rounded p-1 text-white/45 hover:bg-[#FF6F69]/20 hover:text-[#FF6F69]"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
          {slice.length === 0 && (
            <div className="px-4 py-10 text-center text-xs text-white/45">
              <ListFilter className="mx-auto mb-2 h-5 w-5" />
              No transactions match these filters.
            </div>
          )}
        </div>
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-white/10 bg-white/[0.02] px-4 py-2 text-[11px] text-white/55">
            <span>Page {safePage + 1} of {totalPages}</span>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={safePage === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="rounded border border-white/10 px-2 py-1 disabled:opacity-30 hover:bg-white/10"
              >
                ← Prev
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                className="rounded border border-white/10 px-2 py-1 disabled:opacity-30 hover:bg-white/10"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {editing && <EditModal txn={editing} onClose={() => setEditing(null)} />}
      {adding && <AddModal onClose={() => setAdding(false)} />}
    </section>
  );
}

// ─── Reusable select ────────────────────────────────────────────────────────
function Select({
  value,
  onChange,
  placeholder,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white focus:border-[#2CA2FF]/50 focus:outline-none"
    >
      <option value="">{placeholder}</option>
      {children}
    </select>
  );
}

// ─── Edit modal ──────────────────────────────────────────────────────────────
function EditModal({ txn, onClose }: { txn: DemoTransaction; onClose: () => void }) {
  const snap = useDemoSnapshot();
  const { dispatch, toast } = useDemo();
  const cats = useMemo(() => categoryPicker(snap), [snap]);
  const catMap = useMemo(() => categoryById(snap), [snap]);

  const [merchant, setMerchant] = useState(txn.merchant_name ?? "");
  const [amount, setAmount] = useState(num(txn.base_amount).toString());
  const [date, setDate] = useState(txn.posted_date);
  const [catId, setCatId] = useState(txn.category_id?.toString() ?? "");

  const save = () => {
    const newCat = catId ? catMap.get(Number(catId)) : null;
    dispatch({
      type: "UPDATE_TXN",
      id: txn.id,
      patch: {
        merchant_name: merchant || null,
        base_amount: parseFloat(amount).toFixed(4),
        posted_date: date,
        category_id: newCat?.id ?? null,
        category_name: newCat?.name ?? null,
        category_color: newCat?.color ?? null,
        category_slug: newCat?.slug ?? null,
        flow_type: newCat?.flow_type ?? txn.flow_type,
      },
    });
    toast("Updated (demo only — refresh to reset)", "ok");
    onClose();
  };

  return (
    <ModalShell title="Edit transaction" onClose={onClose}>
      <FormRow label="Merchant">
        <input
          value={merchant}
          onChange={(e) => setMerchant(e.target.value)}
          className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white"
        />
      </FormRow>
      <FormRow label="Amount (negative = expense)">
        <input
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white tabular-nums"
        />
      </FormRow>
      <FormRow label="Date">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white"
        />
      </FormRow>
      <FormRow label="Category">
        <select
          value={catId}
          onChange={(e) => setCatId(e.target.value)}
          className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white"
        >
          <option value="">Uncategorized</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>{c.parentName} · {c.name}</option>
          ))}
        </select>
      </FormRow>
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-white/15 px-4 py-2 text-xs text-white/85 hover:bg-white/10"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#0BC18D] to-[#2CA2FF] px-4 py-2 text-xs font-semibold text-white"
        >
          <Save className="h-3.5 w-3.5" /> Save
        </button>
      </div>
    </ModalShell>
  );
}

// ─── Add modal ──────────────────────────────────────────────────────────────
function AddModal({ onClose }: { onClose: () => void }) {
  const snap = useDemoSnapshot();
  const { dispatch, toast } = useDemo();
  const cats = useMemo(() => categoryPicker(snap), [snap]);
  const catMap = useMemo(() => categoryById(snap), [snap]);

  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(snap.transactions[0]?.posted_date ?? "");
  const [catId, setCatId] = useState("");
  const [accountId, setAccountId] = useState(snap.accounts[0]?.id ?? "");

  const save = () => {
    const cat = catId ? catMap.get(Number(catId)) : null;
    dispatch({
      type: "ADD_TXN",
      payload: {
        id: `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        account_id: accountId,
        posted_date: date,
        raw_description: `MANUAL · ${merchant.toUpperCase()}`,
        merchant_name: merchant || null,
        category_id: cat?.id ?? null,
        base_amount: parseFloat(amount || "0").toFixed(4),
        base_currency: snap.family.homeCurrency,
        foreign_amount: null,
        foreign_currency: null,
        implicit_fx_rate: null,
        country_iso: "US",
        is_recurring: false,
        note: null,
        label: null,
        category_slug: cat?.slug ?? null,
        category_name: cat?.name ?? null,
        category_color: cat?.color ?? null,
        flow_type: cat?.flow_type ?? null,
      },
    });
    toast("Added · demo only", "ok");
    onClose();
  };

  return (
    <ModalShell title="Add transaction" onClose={onClose}>
      <FormRow label="Merchant">
        <input
          value={merchant}
          onChange={(e) => setMerchant(e.target.value)}
          placeholder="e.g. H-E-B"
          className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white"
        />
      </FormRow>
      <FormRow label="Amount (negative = expense)">
        <input
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="-42.50"
          className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white tabular-nums"
        />
      </FormRow>
      <FormRow label="Date">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white"
        />
      </FormRow>
      <FormRow label="Account">
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white"
        >
          {snap.accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.account_name}</option>
          ))}
        </select>
      </FormRow>
      <FormRow label="Category">
        <select
          value={catId}
          onChange={(e) => setCatId(e.target.value)}
          className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white"
        >
          <option value="">Uncategorized</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>{c.parentName} · {c.name}</option>
          ))}
        </select>
      </FormRow>
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-white/15 px-4 py-2 text-xs text-white/85 hover:bg-white/10"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#0BC18D] to-[#2CA2FF] px-4 py-2 text-xs font-semibold text-white"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>
    </ModalShell>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-white/15 bg-[#0a0f24] p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">{title}</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-white/45 hover:bg-white/10 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3">{children}</div>
      </div>
    </div>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-white/55">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
