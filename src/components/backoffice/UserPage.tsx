import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardTitle, Failed, GhostButton, InfoTip, MainButton, useLoad } from "@/components/backoffice/parts";
import {
  fetchUserDetail, fmtDate, fmtDateTime, logAdminAction, saveUserName, setUserInternal, type UserDetail,
} from "@/lib/backOffice/users";

const num = (v: number) => v.toLocaleString("en-GB");

function Chip({ children }: { children: ReactNode }) {
  return <span className="rounded-full border border-[#E6E0D5] bg-white px-3 py-1 text-sm font-medium text-[#23201C]">{children}</span>;
}

function Stat({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="rounded-[16px] bg-[#F4F1EA] p-4">
      <p className="text-xs font-medium text-[#6E675F]">{label}</p>
      <p className="mt-1 text-lg font-bold text-[#23201C]" style={{ fontFamily: "Quicksand, system-ui, sans-serif", fontVariantNumeric: "tabular-nums" }}>{value}</p>
      {note && <p className="mt-0.5 text-xs text-[#6E675F]">{note}</p>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#E6E0D5] py-2.5 last:border-0">
      <span className="text-sm text-[#6E675F]">{label}</span>
      <span className="text-sm font-semibold text-[#23201C]">{children}</span>
    </div>
  );
}

const DIALOG = "rounded-[22px] border-[#E6E0D5] bg-white text-[#23201C] [color-scheme:light]";
const FIELD = "w-full rounded-full border border-[#E6E0D5] bg-white px-4 py-2 text-[15px] text-[#23201C] placeholder:text-[#6E675F] [color-scheme:light]";

function EditNameDialog({ user, open, onClose, onSaved }: { user: UserDetail; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(user.name);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { if (open) { setName(user.name); setErr(""); } }, [open, user.name]);
  const save = async () => {
    setBusy(true); setErr("");
    try { await saveUserName(user.id, name); onSaved(); onClose(); } catch { setErr("That didn't save. Use 1 to 80 characters."); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={DIALOG}>
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-semibold text-[#23201C]">Edit her name</DialogTitle>
          <DialogDescription className="text-[15px] text-[#23201C]">Display name only. Her email stays with her.</DialogDescription>
        </DialogHeader>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          aria-label="Display name"
          className={FIELD}
        />
        {err && <p className="text-[15px] text-[#23201C]">{err}</p>}
        <div className="flex justify-end gap-2"><GhostButton onClick={onClose}>Cancel</GhostButton><MainButton onClick={save} disabled={busy || !name.trim()}>{busy ? "Saving…" : "Save"}</MainButton></div>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ user, open, onClose, onDeleted }: { user: UserDetail; open: boolean; onClose: () => void; onDeleted: () => void }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { if (open) { setTyped(""); setErr(""); } }, [open]);
  const matches = user.email.trim() !== "" && typed.trim().toLowerCase() === user.email.trim().toLowerCase();
  const confirm = async () => {
    if (!matches || busy) return;
    setBusy(true); setErr("");
    try {
      await logAdminAction("delete_user", user.id);  // if logging fails, nothing is deleted
      const { data, error } = await supabase.functions.invoke("delete-user", { body: { userId: user.id } });
      if (error) {
        // The function explains what went wrong in its body; fall back to the generic message.
        let msg = "";
        try { msg = (await (error as { context?: Response }).context?.json())?.error ?? ""; } catch { /* ignore */ }
        throw new Error(msg || error.message);
      }
      if (data?.error) throw new Error(data.error);
      onDeleted();
    } catch (e) {
      setErr(e instanceof Error && e.message ? e.message : "The delete didn't finish. Please try again.");
    } finally { setBusy(false); }
  };
  const ready = matches && !busy;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className={DIALOG}>
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-semibold text-[#23201C]">Delete this account?</DialogTitle>
          <DialogDescription className="text-[15px] leading-relaxed text-[#23201C]">
            This permanently deletes her account and everything we hold about her. It can't be undone. To confirm, type her email: <strong className="break-all font-bold">{user.email}</strong>
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); void confirm(); }} className="grid gap-4">
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="her email"
            aria-label="Type her email to confirm"
            autoComplete="off"
            className={FIELD}
          />
          {err && <p role="alert" className="text-[15px] text-[#C4247A]">{err}</p>}
          <div className="flex justify-end gap-2">
            <GhostButton onClick={onClose} disabled={busy}>Cancel</GhostButton>
            <button
              type="submit"
              disabled={!ready}
              aria-disabled={!ready}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${ready ? "bg-[#C4247A] text-white" : "cursor-not-allowed bg-[#DDD7CC] text-[#6E675F]"}`}
            >
              {busy ? "Deleting…" : "Delete account"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function UserPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data: u, error, loading, reload } = useLoad(() => fetchUserDetail(id), [id]);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [toggleErr, setToggleErr] = useState(false);

  const toggleInternal = async (v: boolean) => {
    if (!u) return;
    setToggleBusy(true); setToggleErr(false);
    try { await setUserInternal(u.id, v); reload(); } catch { setToggleErr(true); } finally { setToggleBusy(false); }
  };

  const back = <Link to="/admin/users" className="text-sm font-semibold text-[#6E675F] hover:text-[#23201C]">‹ Users</Link>;

  if (error) return <>{back}<Card><Failed onRetry={reload} /></Card></>;
  if (loading && !u) return <>{back}<p className="text-sm text-[#6E675F]">Loading…</p></>;
  if (!u) return <>{back}<Card><p className="text-sm text-[#6E675F]">We couldn't find her. She may have been deleted.</p></Card></>;

  const health = u.healthConsent
    ? `✓ ${fmtDate(u.healthConsentAt)} · —`
    : u.healthConsentAt ? `Off · ${fmtDate(u.healthConsentAt)}` : "—";
  const together = u.togetherConsent
    ? `✓ ${fmtDate(u.togetherConsentAt)} · ${u.togetherConsentVersion ?? "—"}`
    : "Off";

  return (
    <>
      <div>{back}</div>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[42px] font-semibold leading-none text-[#23201C]">{u.name || "Unnamed"}</h1>
        <GhostButton onClick={() => setEditing(true)}>Edit</GhostButton>
      </header>
      <div className="flex flex-wrap gap-2">
        <Chip>Joined {fmtDate(u.joinedAt)}</Chip>
        <Chip>Came from {u.cameFrom}</Chip>
        {u.internal && <Chip>Internal account</Chip>}
      </div>

      <Card>
        <CardTitle>Engagement</CardTitle>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Last active" value={fmtDateTime(u.lastActiveAt)} />
          <Stat label="Sessions" value={num(u.sessions30d)} note="Last 30 days" />
          <Stat label="Messages sent" value={num(u.msgs30d)} note="Last 30 days · count only" />
          <Stat label="Heads-ups sent" value={num(u.headsupsSent)} />
          <Stat label="Feedback" value={num(u.feedback)} />
          <Stat label="Referrals" value={`${num(u.referralsInvited)} invited, ${num(u.referralsActive)} active`} note="Active = in the last 14 days" />
          <Stat label="Tips shared" value={`${num(u.tipsLive)} live, ${num(u.tipsReported)} reported`} />
        </div>
        <p className="mt-4 text-xs text-[#6E675F]">Her health data, chats and logs are never shown here, including to super admins.</p>
      </Card>

      <Card>
        <CardTitle>Account</CardTitle>
        <Row label="Email">{u.email || "—"}</Row>
      </Card>

      <Card>
        <CardTitle aside={<InfoTip text="Health data consent has a date but no stored version yet." />}>Consent</CardTitle>
        <Row label="Health data">{health}</Row>
        <Row label="Together">{together}</Row>
        <Row label="Marketing emails">{u.marketingOn ? "On" : "Off"}</Row>
      </Card>

      <Card>
        <CardTitle>Admin</CardTitle>
        <div className="flex items-center justify-between gap-3 border-b border-[#E6E0D5] pb-3">
          <label htmlFor="internal" className="text-sm">
            <span className="block font-semibold text-[#23201C]">Internal account</span>
            <span className="block text-xs text-[#6E675F]">Left out of Today and Growth counts.</span>
          </label>
          <Switch id="internal" checked={u.internal} disabled={toggleBusy} onCheckedChange={toggleInternal} className="data-[state=checked]:bg-[#23201C] data-[state=unchecked]:bg-[#DDD7CC] [&>span]:bg-white" />
        </div>
        {toggleErr && <p className="pt-2 text-sm text-[#23201C]">That didn't save. Please try again.</p>}
        <div className="pt-3">
          <button type="button" disabled className="cursor-not-allowed rounded-full border border-[#E6E0D5] bg-white px-3.5 py-1.5 text-sm font-medium text-[#6E675F] opacity-70">
            Send her a data export · Coming soon
          </button>
          <p className="mt-1.5 text-xs text-[#6E675F]">The export goes to her email. You never see it.</p>
        </div>
        <div className="mt-4 border-t border-[#E6E0D5] pt-3">
          <button type="button" onClick={() => setDeleting(true)} className="text-sm font-semibold text-[#C4247A] underline underline-offset-2">Delete account</button>
        </div>
      </Card>

      <EditNameDialog user={u} open={editing} onClose={() => setEditing(false)} onSaved={reload} />
      <DeleteDialog user={u} open={deleting} onClose={() => setDeleting(false)} onDeleted={() => navigate("/admin/users")} />
    </>
  );
}
