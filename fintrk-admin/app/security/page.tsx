"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Shield,
  RefreshCw,
  KeyRound,
  Unlock,
  ClipboardList,
  Building2,
  Download,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const DRP_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>FinTRK Disaster Recovery Plan</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;color:#111;line-height:1.5}
  h1{font-size:1.6rem} h2{font-size:1.15rem;margin-top:1.6em;border-bottom:1px solid #ddd;padding-bottom:4px}
  code{background:#f4f4f5;padding:1px 4px;border-radius:3px;font-size:0.9em}
  ul{padding-left:1.2em} .meta{color:#666;font-size:0.85rem}
</style>
</head>
<body>
  <h1>FinTRK Disaster Recovery Plan</h1>
  <p class="meta">Financial ops · Neon + Clerk + Stripe + field encryption · Admin download</p>
  <h2>1. Scope</h2>
  <p>Covers FinTRK user app (accounts, statements, transactions, budgets, AI insights) and FinTRK Admin ops console. Field-level encryption (FINTRK_ENCRYPTION_KEY) protects PII at rest.</p>
  <h2>2. Critical systems</h2>
  <ul>
    <li><strong>Neon Postgres</strong>  -  source of truth for household financial data</li>
    <li><strong>Clerk</strong>  -  identity (admin allow-list + user app; Pro plan in publicMetadata)</li>
    <li><strong>Stripe</strong>  -  FinTRK Pro subscriptions; webhook writes plan metadata</li>
    <li><strong>Google AI</strong>  -  statement parsing and insights generation</li>
    <li><strong>Vercel</strong>  -  hosting and cron triggers</li>
  </ul>
  <h2>3. RTO / RPO targets</h2>
  <ul>
    <li>RTO: restore read path within 4 hours of Neon region failure</li>
    <li>RPO: Neon PITR / branch restore to last successful checkpoint (aim &lt; 15 min)</li>
    <li>Encryption: restore FINTRK_ENCRYPTION_KEY from secure vault before decrypting; never invent ciphertext</li>
  </ul>
  <h2>4. Incident response</h2>
  <ol>
    <li>Declare severity in admin audit buffer (Security → Audit)</li>
    <li>Revoke active decryption sessions if PII exposure is suspected</li>
    <li>Freeze Pro grants / Stripe price changes if billing integrity is uncertain</li>
    <li>Restore Neon from branch / PITR; verify row counts for users, transactions, statements, accounts</li>
    <li>Re-run smoke: sign-in, statement upload, transaction list, Pro entitlement</li>
    <li>Document root cause and vendor checklist updates</li>
  </ol>
  <h2>5. Backups</h2>
  <ul>
    <li>Neon automatic backups / PITR enabled on production project</li>
    <li><code>admin_audit_buffer</code>, <code>admin_settings</code>, and <code>admin_decryption_sessions</code> are ops metadata  -  export periodically if required</li>
  </ul>
  <h2>6. Contacts</h2>
  <p>Update this section with on-call email, Neon support, Stripe support, Clerk support, and Google Cloud support.</p>
</body>
</html>`;


type AuditItem = {
  id: string;
  adminIdentifier: string;
  action: string;
  resource: string;
  detail: Record<string, unknown>;
  createdAt: string;
};

type SecretRow = {
  key: string;
  label: string;
  group: string;
  present: boolean;
  lengthHint: number;
};

type VendorRow = {
  id: string;
  name: string;
  purpose: string;
  status: string;
  dateSigned: string | null;
  notes: string;
};

export default function SecurityPage() {
  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [secrets, setSecrets] = useState<SecretRow[]>([]);
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [auditAction, setAuditAction] = useState("manual_note");
  const [auditResource, setAuditResource] = useState("security");
  const [auditDetail, setAuditDetail] = useState("");
  const [posting, setPosting] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [a, s, v] = await Promise.all([
        fetch("/api/security/audit").then((r) => r.json()),
        fetch("/api/security/secrets").then((r) => r.json()),
        fetch("/api/security/vendors").then((r) => r.json()),
      ]);
      setAudit(a.items ?? []);
      setSecrets(s.secrets ?? []);
      setVendors(v.vendors ?? []);
    } catch {
      toast.error("Failed to load security data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const secretGroups = useMemo(() => {
    const map = new Map<string, SecretRow[]>();
    for (const row of secrets) {
      const list = map.get(row.group) ?? [];
      list.push(row);
      map.set(row.group, list);
    }
    return [...map.entries()];
  }, [secrets]);

  const postAudit = async () => {
    setPosting(true);
    try {
      const res = await fetch("/api/security/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: auditAction,
          resource: auditResource,
          detail: auditDetail ? { note: auditDetail } : {},
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "fail");
      }
      toast.success("Audit entry logged");
      setAuditDetail("");
      void loadAll();
    } catch (err) {
      toast.error(
        err instanceof Error && err.message !== "fail"
          ? err.message
          : "Could not log audit entry",
      );
    } finally {
      setPosting(false);
    }
  };

  const saveVendor = async (vendor: VendorRow) => {
    try {
      const res = await fetch("/api/security/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorId: vendor.id,
          status: vendor.status,
          dateSigned: vendor.dateSigned,
          notes: vendor.notes,
        }),
      });
      if (!res.ok) throw new Error("fail");
      toast.success(`Saved ${vendor.name}`);
    } catch {
      toast.error("Save failed");
    }
  };

  const downloadDrp = () => {
    const blob = new Blob([DRP_HTML], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "FinTRK-Disaster-Recovery-Plan.html";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div className="flex items-start gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-slate-700 to-slate-900 shadow-sm">
            <Shield className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Security
            </h1>
            <p className="mt-1 text-sm text-slate-500 max-w-2xl">
              Audit trail, secrets presence, vendor checklist, and DRP
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadAll()}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Refresh
        </Button>
      </div>

      <Tabs defaultValue="decryption" className="space-y-4">
        <TabsList>
          <TabsTrigger value="decryption" className="gap-1.5">
            <Unlock className="h-3.5 w-3.5" />
            Decryption
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5">
            <ClipboardList className="h-3.5 w-3.5" />
            Audit
          </TabsTrigger>
          <TabsTrigger value="secrets" className="gap-1.5">
            <KeyRound className="h-3.5 w-3.5" />
            Secrets
          </TabsTrigger>
          <TabsTrigger value="vendors" className="gap-1.5">
            <Building2 className="h-3.5 w-3.5" />
            Vendors
          </TabsTrigger>
          <TabsTrigger value="drp" className="gap-1.5">
            <Download className="h-3.5 w-3.5" />
            DRP
          </TabsTrigger>
        </TabsList>

        
        <TabsContent value="decryption" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Break-the-glass decryption</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                Encrypted columns (users, accounts, statements, transactions, AI insights, net worth)
                stay ciphertext until an admin starts a timed decryption session from the banner
                at the top of every authenticated page.
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Require a reason (min 10 characters); sessions expire after 12 hours</li>
                <li>Start / end is written to admin_audit_buffer (and stdout JSON); start fails closed if audit cannot persist</li>
                <li>Use Security → Secrets to confirm FINTRK_ENCRYPTION_KEY is present</li>
              </ul>
              <p className="text-foreground">
                Scroll to the top banner to Enable / Disable decrypted view. Status updates live
                without leaving this page.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Log admin action</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              <Input
                value={auditAction}
                onChange={(e) => setAuditAction(e.target.value)}
                placeholder="manual_note (manual_* only)"
              />
              <Input
                value={auditResource}
                onChange={(e) => setAuditResource(e.target.value)}
                placeholder="resource"
              />
              <Button onClick={() => void postAudit()} disabled={posting}>
                {posting && (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                )}
                Post
              </Button>
              <Textarea
                className="md:col-span-3"
                value={auditDetail}
                onChange={(e) => setAuditDetail(e.target.value)}
                placeholder="Optional detail note"
                rows={2}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Recent audit buffer</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-40 w-full" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Admin</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Resource</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {audit.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="text-center text-sm text-slate-500 py-8"
                        >
                          No audit rows yet
                        </TableCell>
                      </TableRow>
                    )}
                    {audit.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                          {format(new Date(row.createdAt), "MMM d, HH:mm")}
                        </TableCell>
                        <TableCell className="text-xs font-mono truncate max-w-[140px]">
                          {row.adminIdentifier}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {row.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{row.resource}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="secrets" className="space-y-4">
          {loading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            secretGroups.map(([group, rows]) => (
              <Card key={group}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{group}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {rows.map((row) => (
                    <div
                      key={row.key}
                      className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2"
                    >
                      <div>
                        <div className="text-sm font-medium">{row.label}</div>
                        <div className="text-[11px] text-slate-400">
                          {row.present
                            ? `Present · ${row.lengthHint} chars`
                            : "Missing"}
                        </div>
                      </div>
                      {row.present ? (
                        <CheckCircle2 className="h-4 w-4 text-[#0BC18D]" />
                      ) : (
                        <XCircle className="h-4 w-4 text-[#FF6F69]" />
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="vendors" className="space-y-3">
          {loading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            vendors.map((v) => (
              <Card key={v.id}>
                <CardContent className="pt-4 grid gap-3 md:grid-cols-[1fr_160px_160px_auto]">
                  <div>
                    <div className="font-medium text-sm">{v.name}</div>
                    <div className="text-xs text-slate-500">{v.purpose}</div>
                    <Input
                      className="mt-2 h-8 text-xs"
                      placeholder="Notes"
                      value={v.notes}
                      onChange={(e) =>
                        setVendors((all) =>
                          all.map((x) =>
                            x.id === v.id ? { ...x, notes: e.target.value } : x
                          )
                        )
                      }
                    />
                  </div>
                  <Select
                    value={v.status}
                    onValueChange={(status) =>
                      setVendors((all) =>
                        all.map((x) => (x.id === v.id ? { ...x, status } : x))
                      )
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="signed">Signed</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="n_a">N/A</SelectItem>
                      <SelectItem value="not_required">Not required</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="date"
                    className="h-9"
                    value={v.dateSigned ?? ""}
                    onChange={(e) =>
                      setVendors((all) =>
                        all.map((x) =>
                          x.id === v.id
                            ? { ...x, dateSigned: e.target.value || null }
                            : x
                        )
                      )
                    }
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void saveVendor(v)}
                  >
                    Save
                  </Button>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="drp">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                Disaster Recovery Plan (FinTRK financial ops)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-slate-600">
                Download a self-contained HTML DRP covering Neon, Clerk, Stripe,
                encryption key, and household data recovery steps. Values never leave this
                browser until you save the file.
              </p>
              <Button onClick={downloadDrp}>
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Download DRP HTML
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
