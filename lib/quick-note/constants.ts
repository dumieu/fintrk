export type UserQuickNote = {
  /** Kept for schema/API compat; UI no longer edits title. */
  title: string;
  /** Rich HTML body (sanitized). */
  body: string;
  updatedAt: string | null;
};

export const QUICK_NOTE_TITLE_MAX = 120;
export const QUICK_NOTE_BODY_MAX = 80_000;
export const QUICK_NOTE_LOCAL_KEY = "fintrk-quick-note-v2";
/** Migrate plain-text notes from v1 if ever introduced. */
export const QUICK_NOTE_LOCAL_KEY_LEGACY = "fintrk-quick-note-v1";

export const EMPTY_QUICK_NOTE: UserQuickNote = {
  title: "",
  body: "",
  updatedAt: null,
};
