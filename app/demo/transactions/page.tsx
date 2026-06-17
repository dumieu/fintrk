import { DemoAppShell } from "../demo-app-shell";
import TransactionsPage from "@/app/dashboard/transactions/page";

export default function DemoTransactions() {
  return (
    <DemoAppShell>
      <TransactionsPage />
    </DemoAppShell>
  );
}
