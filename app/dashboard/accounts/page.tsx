"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Landmark, Plus, X, CreditCard, Wallet, PiggyBank, TrendingUp, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const ACCOUNT_ICONS: Record<string, typeof Landmark> = {
  checking: Wallet,
  savings: PiggyBank,
  credit: CreditCard,
  investment: TrendingUp,
  loan: Landmark,
  unknown: HelpCircle,
};

const ACCOUNT_COLORS: Record<string, string> = {
  checking: "#2CA2FF",
  savings: "#0BC18D",
  credit: "#FF6F69",
  investment: "#AD74FF",
  loan: "#ECAA0B",
  unknown: "#808080",
};

interface Account {
  id: string;
  accountName: string;
  accountType: string;
  primaryCurrency: string;
  institutionName: string | null;
  maskedNumber: string | null;
  countryIso: string | null;
  isActive: boolean;
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ accountName: "", accountType: "checking", primaryCurrency: "USD", institutionName: "" });

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/accounts");
      const data = await res.json();
      if (data.data) setAccounts(data.data);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const createAccount = async () => {
    if (!form.accountName) return;
    try {
      await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, institutionName: form.institutionName || undefined }),
      });
      setShowCreate(false);
      setForm({ accountName: "", accountType: "checking", primaryCurrency: "USD", institutionName: "" });
      fetchAccounts();
    } catch {}
  };

  return (
    <div className="min-h-[80vh] bg-gradient-to-b from-[#08051a] via-[#10082a] to-[#160e35]">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-white/70">
            {accounts.length > 0 ? `${accounts.length} linked account${accounts.length !== 1 ? "s" : ""}` : "No accounts yet — they are auto-created when you upload statements"}
          </p>
          <Button onClick={() => setShowCreate(true)} variant="ghost" className="text-[#0BC18D] hover:bg-[#0BC18D]/10 border border-[#0BC18D]/20">
            <Plus className="w-4 h-4 mr-2" />
            Add Manually
          </Button>
        </motion.div>

        <AnimatePresence>
          {showCreate && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mb-6 overflow-hidden">
              <Card className="border-[#0BC18D]/25 bg-[#0BC18D]/[0.05] text-white">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm">Add Account</CardTitle>
                  <Button variant="ghost" size="icon" onClick={() => setShowCreate(false)} className="text-white/40 hover:text-white w-8 h-8"><X className="w-4 h-4" /></Button>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                    <input type="text" placeholder="Account name" value={form.accountName} onChange={(e) => setForm((f) => ({ ...f, accountName: e.target.value }))} className="rounded-lg border border-white/15 bg-white/[0.05] px-3 py-2.5 text-sm text-white placeholder:text-white/45 focus:border-[#0BC18D]/40 focus:outline-none" />
                    <input type="text" placeholder="Bank name (optional)" value={form.institutionName} onChange={(e) => setForm((f) => ({ ...f, institutionName: e.target.value }))} className="rounded-lg border border-white/15 bg-white/[0.05] px-3 py-2.5 text-sm text-white placeholder:text-white/45 focus:border-[#0BC18D]/40 focus:outline-none" />
                    <select value={form.accountType} onChange={(e) => setForm((f) => ({ ...f, accountType: e.target.value }))} className="rounded-lg border border-white/15 bg-white/[0.05] px-3 py-2.5 text-sm text-white focus:outline-none">
                      <option value="checking">Checking</option>
                      <option value="savings">Savings</option>
                      <option value="credit">Credit Card</option>
                      <option value="investment">Investment</option>
                      <option value="loan">Loan</option>
                    </select>
                    <input type="text" placeholder="Currency (USD)" value={form.primaryCurrency} onChange={(e) => setForm((f) => ({ ...f, primaryCurrency: e.target.value.toUpperCase().slice(0, 3) }))} maxLength={3} className="rounded-lg border border-white/15 bg-white/[0.05] px-3 py-2.5 text-sm text-white placeholder:text-white/45 focus:border-[#0BC18D]/40 focus:outline-none" />
                    <Button onClick={createAccount} className="bg-[#0BC18D] text-white hover:bg-[#0BC18D]/90">Create</Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {accounts.map((acct, i) => {
            const Icon = ACCOUNT_ICONS[acct.accountType] ?? Landmark;
            const color = ACCOUNT_COLORS[acct.accountType] ?? "#808080";

            return (
              <motion.div key={acct.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card className="border-white/[0.10] bg-white/[0.04] text-white hover:border-white/[0.18] transition-colors">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${color}15` }}>
                        <Icon className="w-5 h-5" style={{ color }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-white/95 truncate">{acct.accountName}</p>
                        {acct.institutionName && (
                          <p className="text-[10px] text-white/50 truncate">{acct.institutionName}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/8 text-white/65 capitalize">{acct.accountType}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/8 text-white/65 font-mono">{acct.primaryCurrency}</span>
                      {acct.countryIso && <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/8 text-white/65">{acct.countryIso}</span>}
                      {acct.maskedNumber && <span className="text-[10px] text-white/45 font-mono">•••• {acct.maskedNumber}</span>}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>

        {accounts.length === 0 && !loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-20 text-center">
            <Landmark className="w-10 h-10 text-white/20 mb-4" />
            <p className="text-sm text-white/60 mb-2">No accounts yet</p>
            <p className="text-xs text-white/45 max-w-xs">Accounts are automatically created when you upload bank statements, or you can add them manually</p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
