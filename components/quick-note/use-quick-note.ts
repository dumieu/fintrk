"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  clearUserQuickNoteRemote,
  fetchUserQuickNote,
  saveUserQuickNote,
} from "@/lib/quick-note/quick-note-client";
import {
  EMPTY_QUICK_NOTE,
  QUICK_NOTE_LOCAL_KEY,
  QUICK_NOTE_LOCAL_KEY_LEGACY,
  type UserQuickNote,
} from "@/lib/quick-note/constants";
import {
  isProbablyHtml,
  quickNoteHtmlToPlain,
  sanitizeQuickNoteHtml,
} from "@/lib/quick-note/sanitize-html";

function normalizeNote(raw: UserQuickNote): UserQuickNote {
  let body = typeof raw.body === "string" ? raw.body : "";
  if (body && !isProbablyHtml(body)) {
    body = body
      .split("\n")
      .map((line) => {
        const t = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        return t ? `<p>${t}</p>` : "<p><br></p>";
      })
      .join("");
  } else {
    body = sanitizeQuickNoteHtml(body);
  }
  return {
    title: "",
    body,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
  };
}

function readLocalNote(): UserQuickNote {
  if (typeof window === "undefined") return EMPTY_QUICK_NOTE;
  try {
    const raw =
      localStorage.getItem(QUICK_NOTE_LOCAL_KEY) ??
      localStorage.getItem(QUICK_NOTE_LOCAL_KEY_LEGACY);
    if (!raw) return EMPTY_QUICK_NOTE;
    const parsed = JSON.parse(raw) as UserQuickNote;
    return normalizeNote({
      title: "",
      body: typeof parsed.body === "string" ? parsed.body : "",
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
    });
  } catch {
    return EMPTY_QUICK_NOTE;
  }
}

function writeLocalNote(note: UserQuickNote) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(QUICK_NOTE_LOCAL_KEY, JSON.stringify(note));
    localStorage.removeItem(QUICK_NOTE_LOCAL_KEY_LEGACY);
  } catch {
    /* quota */
  }
}

export function useQuickNote() {
  const [note, setNote] = useState<UserQuickNote>(EMPTY_QUICK_NOTE);
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remoteRef = useRef(false);
  const saveTimer = useRef<number | null>(null);
  const pendingRef = useRef<UserQuickNote | null>(null);
  const noteRef = useRef(note);
  noteRef.current = note;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = readLocalNote();
      if (!cancelled && local.body) {
        setNote(local);
      }
      try {
        const remote = await fetchUserQuickNote();
        if (cancelled) return;
        if (remote) {
          remoteRef.current = true;
          const normalized = normalizeNote(remote);
          setNote(normalized);
          writeLocalNote(normalized);
        }
      } catch {
        if (!cancelled) setError("Could not sync note");
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const flushSave = useCallback(async (draft: UserQuickNote) => {
    const stamped: UserQuickNote = {
      title: "",
      body: sanitizeQuickNoteHtml(draft.body),
      updatedAt: new Date().toISOString(),
    };
    const emptyBody =
      !stamped.body.trim() ||
      stamped.body === "<br>" ||
      stamped.body === "<p><br></p>" ||
      stamped.body === "<div><br></div>";

    writeLocalNote(emptyBody ? { ...EMPTY_QUICK_NOTE, updatedAt: stamped.updatedAt } : stamped);
    setSyncing(true);
    setError(null);
    try {
      if (emptyBody) {
        if (remoteRef.current) await clearUserQuickNoteRemote();
        const empty = { ...EMPTY_QUICK_NOTE, updatedAt: stamped.updatedAt };
        setNote(empty);
        return;
      }
      try {
        const saved = await saveUserQuickNote("", stamped.body);
        remoteRef.current = true;
        if (saved.updatedAt) stamped.updatedAt = saved.updatedAt;
        writeLocalNote(stamped);
      } catch {
        /* signed out / offline - local already written */
      }
      setNote(stamped);
    } catch {
      setError("Saved on this device");
      setNote(stamped);
    } finally {
      setSyncing(false);
    }
  }, []);

  const scheduleSave = useCallback(
    (draft: UserQuickNote) => {
      pendingRef.current = draft;
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        const next = pendingRef.current;
        if (next) void flushSave(next);
        pendingRef.current = null;
      }, 500);
    },
    [flushSave],
  );

  const updateBody = useCallback(
    (body: string) => {
      setNote((prev) => {
        const next = { ...prev, title: "", body };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  const flushNow = useCallback(async () => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const draft = pendingRef.current ?? noteRef.current;
    pendingRef.current = null;
    await flushSave(draft);
  }, [flushSave]);

  const clearNote = useCallback(async () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    const empty = { ...EMPTY_QUICK_NOTE, updatedAt: new Date().toISOString() };
    writeLocalNote(empty);
    setNote(empty);
    setSyncing(true);
    try {
      if (remoteRef.current) await clearUserQuickNoteRemote();
    } catch {
      setError("Could not clear on server");
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(
    () => () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    },
    [],
  );

  return {
    note,
    ready,
    syncing,
    error,
    updateBody,
    flushNow,
    clearNote,
  };
}

export function quickNotePreviewTitle(note: UserQuickNote): string {
  const plain = quickNoteHtmlToPlain(note.body);
  const first = plain
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  if (!first) return "Quick Note";
  return first.length > 42 ? `${first.slice(0, 42)}…` : first;
}

export function quickNotePreviewBody(note: UserQuickNote): string {
  const plain = quickNoteHtmlToPlain(note.body);
  const lines = plain
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return "Tap to write…";
  if (lines.length === 1) {
    return lines[0]!.length > 72 ? `${lines[0]!.slice(0, 72)}…` : lines[0]!;
  }
  return lines.slice(1, 3).join(" · ");
}
