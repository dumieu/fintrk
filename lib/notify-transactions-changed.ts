/** Fired on `window` when transaction data changes so client UIs can refresh (e.g. category mind map totals). */
export const FINTRK_TRANSACTIONS_CHANGED = "fintrk:transactions-changed";

export function dispatchTransactionsChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(FINTRK_TRANSACTIONS_CHANGED));
}
