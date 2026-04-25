"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export interface ColumnDef {
  name: string;
  type: string;
  default: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  table: string;
  columns: ColumnDef[];
  primaryKey: string | null;
  row: Record<string, unknown> | null; // null = create
  onSaved: () => void;
}

const READ_ONLY_FIELDS = new Set(["created_at", "updated_at"]);

function isLongTextColumn(c: ColumnDef): boolean {
  if (c.type === "text") return true;
  if (c.type === "jsonb" || c.type === "json") return true;
  return false;
}

function isCheckable(c: ColumnDef): boolean {
  return c.type === "boolean";
}

function isNumeric(c: ColumnDef): boolean {
  return ["integer", "bigint", "numeric", "double precision", "real", "smallint"].includes(c.type);
}

function isDate(c: ColumnDef): boolean {
  return c.type === "date";
}

function defaultDisplay(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") {
    try { return JSON.stringify(value, null, 2); } catch { return String(value); }
  }
  return String(value);
}

function buildInitialValues(columns: ColumnDef[], row: Record<string, unknown> | null) {
  const init: Record<string, string | boolean> = {};
  for (const c of columns) {
    const v = row?.[c.name];
    if (isCheckable(c)) init[c.name] = v === true || v === "true";
    else init[c.name] = defaultDisplay(v);
  }
  return init;
}

export function RowEditorDialog({ open, onOpenChange, table, columns, primaryKey, row, onSaved }: Props) {
  const isEdit = !!row;
  const [values, setValues] = useState<Record<string, string | boolean>>(() => buildInitialValues(columns, row));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValues(buildInitialValues(columns, row));
  }, [open, row, columns]);

  async function save() {
    setBusy(true);
    try {
      const data: Record<string, unknown> = {};
      for (const c of columns) {
        if (READ_ONLY_FIELDS.has(c.name)) continue;
        const raw = values[c.name];
        if (isCheckable(c)) {
          data[c.name] = !!raw;
          continue;
        }
        const str = (raw as string) ?? "";
        if (str === "") {
          if (isEdit) data[c.name] = null;
          continue;
        }
        if (c.type === "jsonb" || c.type === "json") {
          try { data[c.name] = JSON.parse(str); } catch { data[c.name] = str; }
        } else if (isNumeric(c)) {
          const n = Number(str);
          data[c.name] = Number.isFinite(n) ? n : str;
        } else {
          data[c.name] = str;
        }
      }

      const url = "/api/rows";
      const init: RequestInit = { headers: { "Content-Type": "application/json" } };

      if (isEdit && primaryKey) {
        init.method = "PUT";
        init.body = JSON.stringify({
          table,
          primaryKey,
          primaryValue: row?.[primaryKey],
          data,
        });
      } else {
        init.method = "POST";
        init.body = JSON.stringify({ table, data });
      }
      const res = await fetch(url, init);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      toast.success(isEdit ? "Row updated" : "Row created");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!isEdit || !primaryKey) return;
    if (!confirm(`Delete this row from "${table}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const params = new URLSearchParams({
        table,
        primaryKey,
        primaryValue: String(row?.[primaryKey] ?? ""),
      });
      const res = await fetch(`/api/rows?${params.toString()}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      toast.success("Row deleted");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit row" : "Insert row"}{" "}
            <span className="text-muted-foreground">·</span>{" "}
            <span className="font-mono text-sm font-normal text-muted-foreground">{table}</span>
          </DialogTitle>
          <DialogDescription>
            {isEdit && primaryKey ? (
              <>Editing {primaryKey}={String(row?.[primaryKey] ?? "")}</>
            ) : (
              "Empty fields with no default are skipped."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {columns.map((c) => {
            const ro = READ_ONLY_FIELDS.has(c.name);
            const id = `f-${c.name}`;
            return (
              <div key={c.name} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor={id} className="font-mono">{c.name}</Label>
                  <Badge variant="outline" className="text-[9px] uppercase">{c.type}</Badge>
                </div>
                {isCheckable(c) ? (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      id={id}
                      type="checkbox"
                      checked={!!values[c.name]}
                      onChange={(e) => setValues((v) => ({ ...v, [c.name]: e.target.checked }))}
                      disabled={ro}
                    />
                    <span className="text-muted-foreground">{values[c.name] ? "true" : "false"}</span>
                  </label>
                ) : isLongTextColumn(c) ? (
                  <Textarea
                    id={id}
                    rows={4}
                    disabled={ro}
                    value={(values[c.name] as string) ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [c.name]: e.target.value }))}
                    placeholder={ro ? "(read-only)" : c.default ?? ""}
                    className="font-mono text-xs"
                  />
                ) : (
                  <Input
                    id={id}
                    type={isDate(c) ? "date" : isNumeric(c) ? "number" : "text"}
                    step={isNumeric(c) ? "any" : undefined}
                    disabled={ro}
                    value={(values[c.name] as string) ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [c.name]: e.target.value }))}
                    placeholder={ro ? "(read-only)" : c.default ?? ""}
                  />
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter className="mt-2 sm:justify-between">
          {isEdit ? (
            <Button variant="destructive" disabled={busy} onClick={remove} className="gap-2">
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <DialogClose asChild>
              <Button variant="ghost" disabled={busy}>Cancel</Button>
            </DialogClose>
            <Button onClick={save} disabled={busy} className="gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {isEdit ? "Save changes" : "Insert row"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
