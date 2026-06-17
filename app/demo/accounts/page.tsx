import { DemoAppShell } from "../demo-app-shell";
import AccountsPage from "@/app/dashboard/accounts/page";

export default function DemoAccounts() {
  return (
    <DemoAppShell>
      <AccountsPage />
    </DemoAppShell>
  );
}
