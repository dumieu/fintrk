"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Search,
  Filter,
  ArrowUpDown,
  Globe,
  Repeat,
  ChevronLeft,
  ChevronRight,
  Upload,
  ArrowLeftRight,
} from "lucide-react";
import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Transaction {
  id: string;
  postedDate: string;
  cleanDescription: string;
  merchantName: string | null;
  baseAmount: string;
  baseCurrency: string;
  foreignAmount: string | null;
  foreignCurrency: string | null;
  implicitFxSpreadBps: string | null;
  categoryId: number | null;
  categorySuggestion: string | null;
  countryIso: string | null;
  isRecurring: boolean;
  aiConfidence: string | null;
  accountId: string;
}

interface Filters {
  search: string;
  dateFrom: string;
  dateTo: string;
  isRecurring: string;
  accountId: string;
  categoryId: string;
  currency: string;
  countryIso: string;
  sortBy: string;
  sortDir: string;
  page: number;
}

interface FilterOption { value: string; label: string };

export default function TransactionsPage() {
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    search: "",
    dateFrom: "",
    dateTo: "",
    isRecurring: "",
    accountId: "",
    categoryId: "",
    currency: "",
    countryIso: "",
    sortBy: "posted_date",
    sortDir: "desc",
    page: 1,
  });
  const [accountOptions, setAccountOptions] = useState<FilterOption[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<FilterOption[]>([]);
  const [currencyOptions, setCurrencyOptions] = useState<FilterOption[]>([]);
  const [countryOptions, setCountryOptions] = useState<FilterOption[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/accounts").then((r) => r.json()).then((d) =>
        setAccountOptions((d.data ?? []).map((a: { id: string; accountName: string }) => ({ value: a.id, label: a.accountName }))),
      ),
      fetch("/api/transactions/filter-options").then((r) => r.json()).then((d) => {
        if (d.categories) setCategoryOptions(d.categories);
        if (d.currencies) setCurrencyOptions(d.currencies);
        if (d.countries) setCountryOptions(d.countries);
      }),
    ]).catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.search) params.set("search", filters.search);
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    if (filters.isRecurring) params.set("isRecurring", filters.isRecurring);
    if (filters.accountId) params.set("accountId", filters.accountId);
    if (filters.categoryId) params.set("categoryId", filters.categoryId);
    if (filters.currency) params.set("currency", filters.currency);
    if (filters.countryIso) params.set("countryIso", filters.countryIso);
    params.set("sortBy", filters.sortBy);
    params.set("sortDir", filters.sortDir);
    params.set("page", filters.page.toString());
    params.set("limit", "25");

    try {
      const res = await fetch(`/api/transactions?${params}`);
      const data = await res.json();
      if (data.data) {
        setTxns(data.data);
        setTotal(data.total);
        setPages(data.pages);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleSort = (col: string) => {
    setFilters((f) => ({
      ...f,
      sortBy: col,
      sortDir: f.sortBy === col && f.sortDir === "desc" ? "asc" : "desc",
      page: 1,
    }));
  };

  return (
    <div className="min-h-[80vh] bg-gradient-to-b from-[#08051a] via-[#10082a] to-[#160e35]">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white sm:text-3xl">Transactions</h1>
            <p className="mt-1 text-sm text-white/70">
              {total > 0 ? `${total.toLocaleString()} transactions` : "No transactions yet"}
            </p>
          </div>
          <Link href="/dashboard/upload">
            <Button variant="ghost" className="text-[#0BC18D] hover:bg-[#0BC18D]/10">
              <Upload className="w-4 h-4 mr-2" />
              Import More
            </Button>
          </Link>
        </motion.div>

        {/* Search + Filters */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="mb-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
            <input
              type="text"
              placeholder="Search merchants, descriptions…"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))}
              className="w-full rounded-lg border border-white/15 bg-white/[0.05] px-10 py-2.5 text-sm text-white placeholder:text-white/45 focus:border-[#0BC18D]/40 focus:outline-none focus:ring-1 focus:ring-[#0BC18D]/20"
            />
          </div>
          <Button
            variant="ghost"
            onClick={() => setShowFilters(!showFilters)}
            className={cn("text-white/70 hover:text-white border border-white/15", showFilters && "bg-white/8 text-white")}
          >
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </Button>
        </motion.div>

        {showFilters && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mb-4 rounded-xl border border-white/15 bg-white/[0.04] p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-[10px] text-white/60 uppercase tracking-wider font-medium mb-1 block">From</label>
                <input type="date" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value, page: 1 }))} className="w-full rounded-lg border border-white/15 bg-white/[0.05] px-3 py-2 text-sm text-white focus:border-[#0BC18D]/40 focus:outline-none" />
              </div>
              <div>
                <label className="text-[10px] text-white/60 uppercase tracking-wider font-medium mb-1 block">To</label>
                <input type="date" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value, page: 1 }))} className="w-full rounded-lg border border-white/15 bg-white/[0.05] px-3 py-2 text-sm text-white focus:border-[#0BC18D]/40 focus:outline-none" />
              </div>
              <div>
                <label className="text-[10px] text-white/60 uppercase tracking-wider font-medium mb-1 block">Type</label>
                <select value={filters.isRecurring} onChange={(e) => setFilters((f) => ({ ...f, isRecurring: e.target.value, page: 1 }))} className="w-full rounded-lg border border-white/15 bg-white/[0.05] px-3 py-2 text-sm text-white focus:border-[#0BC18D]/40 focus:outline-none">
                  <option value="">All</option>
                  <option value="true">Recurring only</option>
                  <option value="false">One-time only</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-white/60 uppercase tracking-wider font-medium mb-1 block">Account</label>
                <select value={filters.accountId} onChange={(e) => setFilters((f) => ({ ...f, accountId: e.target.value, page: 1 }))} className="w-full rounded-lg border border-white/15 bg-white/[0.05] px-3 py-2 text-sm text-white focus:border-[#0BC18D]/40 focus:outline-none">
                  <option value="">All accounts</option>
                  {accountOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
              <div>
                <label className="text-[10px] text-white/60 uppercase tracking-wider font-medium mb-1 block">Category</label>
                <select value={filters.categoryId} onChange={(e) => setFilters((f) => ({ ...f, categoryId: e.target.value, page: 1 }))} className="w-full rounded-lg border border-white/15 bg-white/[0.05] px-3 py-2 text-sm text-white focus:border-[#0BC18D]/40 focus:outline-none">
                  <option value="">All categories</option>
                  {categoryOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-white/60 uppercase tracking-wider font-medium mb-1 block">Currency</label>
                <select value={filters.currency} onChange={(e) => setFilters((f) => ({ ...f, currency: e.target.value, page: 1 }))} className="w-full rounded-lg border border-white/15 bg-white/[0.05] px-3 py-2 text-sm text-white focus:border-[#0BC18D]/40 focus:outline-none">
                  <option value="">All currencies</option>
                  {currencyOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-white/60 uppercase tracking-wider font-medium mb-1 block">Country</label>
                <select value={filters.countryIso} onChange={(e) => setFilters((f) => ({ ...f, countryIso: e.target.value, page: 1 }))} className="w-full rounded-lg border border-white/15 bg-white/[0.05] px-3 py-2 text-sm text-white focus:border-[#0BC18D]/40 focus:outline-none">
                  <option value="">All countries</option>
                  {countryOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          </motion.div>
        )}

        {/* Transaction Table */}
        <Card className="border-white/[0.10] bg-white/[0.04] text-white overflow-hidden">
          <CardContent className="p-0">
            {txns.length > 0 ? (
              <>
                {/* Desktop header */}
                <div className="hidden sm:grid sm:grid-cols-[1fr_2fr_1fr_1fr_80px] gap-2 px-4 py-3 border-b border-white/10 text-[10px] font-medium text-white/50 uppercase tracking-wider">
                  <button type="button" onClick={() => toggleSort("posted_date")} className="flex items-center gap-1 text-left hover:text-white/70">
                    Date <ArrowUpDown className="w-3 h-3" />
                  </button>
                  <span>Description</span>
                  <span>Category</span>
                  <button type="button" onClick={() => toggleSort("base_amount")} className="flex items-center gap-1 text-right justify-end hover:text-white/70">
                    Amount <ArrowUpDown className="w-3 h-3" />
                  </button>
                  <span className="text-center">Flags</span>
                </div>

                <div className="divide-y divide-white/10">
                  {txns.map((txn, i) => {
                    const amt = parseFloat(txn.baseAmount);
                    const isIncome = amt > 0;
                    const hasFx = !!txn.foreignCurrency;
                    const spreadBps = txn.implicitFxSpreadBps ? parseFloat(txn.implicitFxSpreadBps) : 0;

                    return (
                      <motion.div
                        key={txn.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.02 }}
                        className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_2fr_1fr_1fr_80px] gap-2 px-4 py-3 hover:bg-white/[0.06] transition-colors"
                      >
                        <div className="text-xs text-white/65 tabular-nums">
                          {formatDate(txn.postedDate)}
                        </div>
                        <div className="col-span-1 sm:col-span-1">
                          <p className="text-xs font-medium text-white/90 truncate">
                            {txn.merchantName ?? txn.cleanDescription}
                          </p>
                          <p className="text-[10px] text-white/50 truncate sm:hidden">
                            {txn.categorySuggestion ?? "Uncategorized"}
                          </p>
                        </div>
                        <div className="hidden sm:block">
                          <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-white/8 text-white/65 truncate max-w-full">
                            {txn.categorySuggestion ?? "Uncategorized"}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className={cn(
                            "text-xs font-bold tabular-nums",
                            isIncome ? "text-[#0BC18D]" : "text-white/90",
                          )}>
                            {isIncome ? "+" : "−"}{formatCurrency(Math.abs(amt), txn.baseCurrency)}
                          </span>
                          {hasFx && txn.foreignAmount && (
                            <p className="text-[9px] text-[#AD74FF]/70 tabular-nums">
                              {formatCurrency(Math.abs(parseFloat(txn.foreignAmount)), txn.foreignCurrency!)}
                              {spreadBps > 50 && (
                                <span className="ml-1 text-[#FF6F69]">+{(spreadBps / 100).toFixed(1)}%</span>
                              )}
                            </p>
                          )}
                        </div>
                        <div className="hidden sm:flex items-center justify-center gap-1.5">
                          {txn.isRecurring && <Repeat className="w-3 h-3 text-[#AD74FF]" />}
                          {txn.countryIso && <span className="text-[9px] text-white/50">{txn.countryIso}</span>}
                          {hasFx && <Globe className="w-3 h-3 text-[#AD74FF]/50" />}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Pagination */}
                {pages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-white/10">
                    <span className="text-[10px] text-white/50">
                      Page {filters.page} of {pages}
                    </span>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={filters.page <= 1}
                        onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
                        className="w-8 h-8 text-white/60 hover:text-white"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={filters.page >= pages}
                        onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
                        className="w-8 h-8 text-white/60 hover:text-white"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <ArrowLeftRight className="w-8 h-8 text-white/20 mb-4" />
                <p className="text-sm text-white/60 mb-4">No transactions found</p>
                <Link href="/dashboard/upload">
                  <Button className="bg-[#0BC18D] text-white hover:bg-[#0BC18D]/90">
                    <Upload className="w-4 h-4 mr-2" /> Upload Statement
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
