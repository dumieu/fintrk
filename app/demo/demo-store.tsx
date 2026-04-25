"use client";

/**
 * In-memory store for the FinTRK demo.
 *
 * Loads the canonical Sterling-family snapshot once from /api/demo/snapshot,
 * then exposes read + mutation helpers.  Every "edit" mutates ONLY this
 * client-side store — nothing is ever sent back to the server.  A page
 * refresh re-fetches the immutable snapshot so the demo always returns
 * to its known-good state.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";

// ─── Types (mirror the snapshot route) ───────────────────────────────────────
export interface DemoAccount {
  id: string;
  account_name: string;
  institution_name: string | null;
  account_type: string;
  card_network: string | null;
  masked_number: string | null;
  primary_currency: string;
  country_iso: string | null;
  is_active: boolean;
}

export interface DemoCategory {
  id: number;
  name: string;
  slug: string;
  parent_id: number | null;
  icon: string | null;
  color: string | null;
  sort_order: number;
  subcategory_type: string | null;
  flow_type: "inflow" | "outflow" | "savings" | "misc";
}

export interface DemoTransaction {
  id: string;
  account_id: string;
  posted_date: string;
  raw_description: string;
  merchant_name: string | null;
  category_id: number | null;
  base_amount: string; // numeric → string from pg
  base_currency: string;
  foreign_amount: string | null;
  foreign_currency: string | null;
  implicit_fx_rate: string | null;
  country_iso: string | null;
  is_recurring: boolean;
  note: string | null;
  label: string | null;
  category_slug: string | null;
  category_name: string | null;
  category_color: string | null;
  flow_type: string | null;
}

export interface DemoRecurring {
  id: number;
  merchant_name: string;
  category_id: number | null;
  interval_days: number;
  interval_label: string;
  expected_amount: string;
  currency: string;
  next_expected_date: string | null;
  last_seen_date: string | null;
  occurrence_count: number;
  is_active: boolean;
}

export interface DemoGoal {
  id: number;
  name: string;
  target_amount: string;
  current_amount: string;
  currency: string;
  target_date: string | null;
  linked_account_ids: string[] | null;
  is_completed: boolean;
}

export interface DemoBudget {
  id: number;
  category_id: number | null;
  account_id: string | null;
  name: string;
  amount: string;
  currency: string;
  period: string;
  rollover: boolean;
  alert_threshold: string | null;
  is_active: boolean;
}

export interface DemoInsight {
  id: number;
  insight_type: string;
  title: string;
  body: string;
  severity: string | null;
  metadata: Record<string, unknown> | null;
  is_read: boolean;
  is_dismissed: boolean;
  generated_at: string;
}

export interface DemoStatement {
  id: number;
  account_id: string;
  file_name: string;
  file_size: number;
  status: string;
  transactions_imported: number | null;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
}

export interface DemoFamily {
  name: string;
  city: string;
  adults: string[];
  kids: string[];
  tagline: string;
  homeCurrency: string;
}

export interface DemoSnapshot {
  family: DemoFamily;
  accounts: DemoAccount[];
  categories: DemoCategory[];
  transactions: DemoTransaction[];
  recurring: DemoRecurring[];
  goals: DemoGoal[];
  budgets: DemoBudget[];
  insights: DemoInsight[];
  statements: DemoStatement[];
  generatedAt: string;
}

// ─── Reducer ─────────────────────────────────────────────────────────────────
type Action =
  | { type: "HYDRATE"; payload: DemoSnapshot }
  | { type: "ADD_TXN"; payload: DemoTransaction }
  | { type: "UPDATE_TXN"; id: string; patch: Partial<DemoTransaction> }
  | { type: "DELETE_TXN"; id: string }
  | { type: "RECATEGORIZE"; ids: string[]; categoryId: number; categoryName: string; categoryColor: string | null; flowType: string | null; categorySlug: string | null }
  | { type: "TOGGLE_RECURRING"; id: number }
  | { type: "UPDATE_GOAL"; id: number; patch: Partial<DemoGoal> }
  | { type: "ADD_GOAL"; payload: DemoGoal }
  | { type: "DELETE_GOAL"; id: number }
  | { type: "UPDATE_BUDGET"; id: number; patch: Partial<DemoBudget> }
  | { type: "DISMISS_INSIGHT"; id: number };

function reducer(state: DemoSnapshot | null, action: Action): DemoSnapshot | null {
  if (action.type === "HYDRATE") return action.payload;
  if (!state) return state;
  switch (action.type) {
    case "ADD_TXN":
      return { ...state, transactions: [action.payload, ...state.transactions] };
    case "UPDATE_TXN":
      return {
        ...state,
        transactions: state.transactions.map((t) => (t.id === action.id ? { ...t, ...action.patch } : t)),
      };
    case "DELETE_TXN":
      return { ...state, transactions: state.transactions.filter((t) => t.id !== action.id) };
    case "RECATEGORIZE": {
      const ids = new Set(action.ids);
      return {
        ...state,
        transactions: state.transactions.map((t) =>
          ids.has(t.id)
            ? {
                ...t,
                category_id: action.categoryId,
                category_name: action.categoryName,
                category_color: action.categoryColor,
                flow_type: action.flowType,
                category_slug: action.categorySlug,
              }
            : t,
        ),
      };
    }
    case "TOGGLE_RECURRING":
      return {
        ...state,
        recurring: state.recurring.map((r) => (r.id === action.id ? { ...r, is_active: !r.is_active } : r)),
      };
    case "UPDATE_GOAL":
      return {
        ...state,
        goals: state.goals.map((g) => (g.id === action.id ? { ...g, ...action.patch } : g)),
      };
    case "ADD_GOAL":
      return { ...state, goals: [...state.goals, action.payload] };
    case "DELETE_GOAL":
      return { ...state, goals: state.goals.filter((g) => g.id !== action.id) };
    case "UPDATE_BUDGET":
      return {
        ...state,
        budgets: state.budgets.map((b) => (b.id === action.id ? { ...b, ...action.patch } : b)),
      };
    case "DISMISS_INSIGHT":
      return {
        ...state,
        insights: state.insights.map((i) => (i.id === action.id ? { ...i, is_dismissed: true } : i)),
      };
    default:
      return state;
  }
}

// ─── Toast helper (super lightweight) ─────────────────────────────────────────
interface Toast {
  id: number;
  text: string;
  tone: "info" | "warn" | "ok";
}

interface DemoCtx {
  snapshot: DemoSnapshot | null;
  loading: boolean;
  error: string | null;
  toasts: Toast[];
  dispatch: React.Dispatch<Action>;
  toast: (text: string, tone?: Toast["tone"]) => void;
}

const Ctx = createContext<DemoCtx | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [snapshot, dispatch] = useReducer(reducer, null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(1);

  const toast = useCallback((text: string, tone: Toast["tone"] = "info") => {
    const id = toastIdRef.current++;
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/demo/snapshot", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`snapshot ${r.status}`);
        return (await r.json()) as DemoSnapshot;
      })
      .then((data) => {
        if (cancelled) return;
        dispatch({ type: "HYDRATE", payload: data });
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<DemoCtx>(
    () => ({ snapshot, loading, error, toasts, dispatch, toast }),
    [snapshot, loading, error, toasts, toast],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDemo(): DemoCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDemo must be inside <DemoProvider>");
  return v;
}

// ─── Convenience derived data hooks ──────────────────────────────────────────
export function useDemoSnapshot(): DemoSnapshot {
  const { snapshot } = useDemo();
  if (!snapshot) throw new Error("snapshot not loaded — guard with useDemo().loading");
  return snapshot;
}
