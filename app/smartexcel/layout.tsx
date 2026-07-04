import { redirect } from "next/navigation";
import { getSmartExcelUser } from "@/app/lib/smartexcel/auth";
import { SmartExcelShell } from "./shell";

export default async function SmartExcelLayout({ children }: { children: React.ReactNode }) {
  const user = await getSmartExcelUser();
  if (!user) redirect("/admin/toolkit");

  return (
    <SmartExcelShell
      user={{
        name: user.name,
        email: user.email,
        roleKey: user.roleKey,
        isSuperAdmin: user.isSuperAdmin,
      }}
    >
      {children}
    </SmartExcelShell>
  );
}
