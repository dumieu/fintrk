"use client";

/**
 * Lightweight global opener for the statement viewer popup. Any component
 * (a transaction row, the statements list, etc.) can request the viewer without
 * threading props/context through the tree. A single <StatementViewerHost/>
 * mounted in the dashboard layout listens and renders the modal.
 */

export const FINTRK_OPEN_STATEMENT_VIEWER = "fintrk:open-statement-viewer";

export interface StatementViewerTarget {
  statementId: number;
  fileName?: string | null;
  mimeType?: string | null;
}

export function openStatementViewer(target: StatementViewerTarget): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<StatementViewerTarget>(FINTRK_OPEN_STATEMENT_VIEWER, { detail: target }),
  );
}
