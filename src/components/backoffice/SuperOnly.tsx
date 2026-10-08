import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useBackOffice } from "@/components/backoffice/BackOfficeShell";

/** Super admin only. Admins are sent back to Today; the server functions refuse them as well. */
export default function SuperOnly({ children }: { children: ReactNode }) {
  const { role } = useBackOffice();
  return role === "super_admin" ? <>{children}</> : <Navigate to="/admin" replace />;
}
