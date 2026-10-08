import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useOutletContext } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useForceLightTheme } from "@/hooks/useForceLightTheme";
import { LoganFullLogo } from "@/components/LoganFullLogo";
import { RangeToggle } from "@/components/backoffice/parts";
import type { RangeKey } from "@/lib/backOffice/math";

export type BackOfficeRole = "super_admin" | "admin";
export interface BackOfficeContext { role: BackOfficeRole; range: RangeKey }

export const useBackOffice = () => useOutletContext<BackOfficeContext>();

/** Screens not rebuilt yet open the existing admin screens. */
const OLD = (tab: string) => `/admin/classic?tab=${tab}`;
interface NavItem { label: string; to: string; old?: boolean; superOnly?: boolean; prefix?: boolean }
const NAV: NavItem[] = [
  { label: "Today", to: "/admin" },
  { label: "Users", to: "/admin/users", superOnly: true, prefix: true },
  { label: "Feedback", to: "/admin/feedback" },
  { label: "Referrals", to: OLD("referrals"), old: true },
  { label: "Tips", to: OLD("tips"), old: true },
  { label: "Growth", to: "/admin/growth", superOnly: true },
  { label: "Reports", to: OLD("attribution"), old: true },
  { label: "Send", to: OLD("notifications"), old: true },
];

const itemClass = (active: boolean) =>
  `block rounded-full px-4 py-2 text-sm font-semibold transition-colors ${active ? "bg-[#F4F1EA] text-[#23201C]" : "text-[#6E675F] hover:text-[#23201C]"}`;

export default function BackOfficeShell() {
  useForceLightTheme();
  const navigate = useNavigate();
  const path = useLocation().pathname;
  const title = path.startsWith("/admin/growth") ? "Growth" : "Today";
  const ownHeader = path.startsWith("/admin/users") || path.startsWith("/admin/feedback"); // these pages draw their own heading
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [role, setRole] = useState<BackOfficeRole | null>(null);
  const [range, setRange] = useState<RangeKey>("30d");

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); if (!s) setReady(true); });
    supabase.auth.getSession().then(({ data: { session: s } }) => { setSession(s); if (!s) setReady(true); });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!ready && !session) return;
    if (!session) { navigate("/logan-admin-access"); return; }
    let cancelled = false;
    const check = async (attempt = 0) => {
      const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", session.user.id).in("role", ["admin", "super_admin"]);
      if (cancelled) return;
      if (error) {
        if (attempt < 2) { setTimeout(() => check(attempt + 1), 400); return; }
        navigate("/");
        return;
      }
      const roles = (data ?? []).map((r) => r.role as string);
      if (roles.length === 0) { navigate("/"); return; }
      setRole(roles.includes("super_admin") ? "super_admin" : "admin");
      setReady(true);
    };
    check();
    return () => { cancelled = true; };
  }, [session, ready, navigate]);

  if (!session || !role) {
    return <div className="flex min-h-screen items-center justify-center bg-[#F4F1EA] font-sans text-sm text-[#6E675F]">Loading…</div>;
  }

  const items = NAV.filter((i) => role === "super_admin" || !i.superOnly);
  const signOut = async () => { await supabase.auth.signOut(); navigate("/auth"); };

  return (
    <div className="min-h-screen bg-[#F4F1EA] font-sans text-[#23201C] lg:flex">
      <aside className="flex shrink-0 flex-col border-b border-[#E6E0D5] bg-white p-4 lg:sticky lg:top-0 lg:h-screen lg:w-[220px] lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between lg:block">
          <Link to="/admin" aria-label="Logan back office"><LoganFullLogo size="sm" className="text-[#23201C]" /></Link>
          <span className="rounded-full border border-[#E6E0D5] px-3 py-1 text-xs font-semibold text-[#6E675F] lg:mt-3 lg:inline-block">
            {role === "super_admin" ? "Super admin" : "Admin"}
          </span>
        </div>
        <nav aria-label="Back office" className="mt-4 flex gap-1 overflow-x-auto lg:flex-1 lg:flex-col lg:overflow-visible">
          {items.map((i) =>
            i.old ? (
              <Link key={i.label} to={i.to} className={itemClass(false) + " whitespace-nowrap"}>{i.label}</Link>
            ) : (
              <NavLink key={i.label} to={i.to} end={!i.prefix} className={({ isActive }) => itemClass(isActive) + " whitespace-nowrap"}>{i.label}</NavLink>
            ),
          )}
          {role === "super_admin" && <Link to={OLD("admins")} className={itemClass(false) + " whitespace-nowrap lg:hidden"}>Settings and admins</Link>}
        </nav>
        <div className="mt-2 hidden lg:block">
          {role === "super_admin" && <Link to={OLD("admins")} className={itemClass(false)}>Settings and admins</Link>}
          <button type="button" onClick={signOut} className={`${itemClass(false)} flex w-full items-center gap-2 text-left`}>
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 lg:px-8">
        <div className="mx-auto max-w-5xl space-y-5">
          {!ownHeader && <header>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="font-display text-[42px] font-semibold leading-none text-[#23201C]">{title}</h1>
              <RangeToggle value={range} onChange={setRange} />
            </div>
            <p className="mt-2 text-xs text-[#6E675F]">Counts only. No health data, no names.</p>
          </header>}
          <Outlet context={{ role, range } satisfies BackOfficeContext} />
        </div>
      </main>
    </div>
  );
}
