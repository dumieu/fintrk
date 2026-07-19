"use client";

import { useEffect, useState } from "react";
import { StatementViewer } from "@/components/statement-viewer";
import {
  FINTRK_OPEN_STATEMENT_VIEWER,
  type StatementViewerTarget,
} from "@/lib/open-statement-viewer";

/** Single mount point (dashboard layout) that renders the statement viewer in
 *  response to openStatementViewer() from anywhere in the app. */
export function StatementViewerHost() {
  const [target, setTarget] = useState<StatementViewerTarget | null>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<StatementViewerTarget>).detail;
      if (detail && Number.isFinite(detail.statementId)) setTarget(detail);
    };
    window.addEventListener(FINTRK_OPEN_STATEMENT_VIEWER, onOpen);
    return () => window.removeEventListener(FINTRK_OPEN_STATEMENT_VIEWER, onOpen);
  }, []);

  if (!target) return null;

  return (
    <StatementViewer
      statementId={target.statementId}
      fileName={target.fileName}
      mimeType={target.mimeType}
      onClose={() => setTarget(null)}
    />
  );
}
