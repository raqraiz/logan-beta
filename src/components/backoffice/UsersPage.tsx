import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, GhostButton, SELECTED, PillToggle } from "@/components/backoffice/parts";
import {
  buildCsv, downloadCsv, fetchUsers, fetchUsersForCsv, relativeDay, fmtDate, PAGE_SIZE,
  type UserFilter, type UserListRow, type UserQuery, type UserSort,
} from "@/lib/backOffice/users";

const SORTS: { value: UserSort; label: string }[] = [
  { value: "last_active", label: "Last active" },
  { value: "messages", label: "Messages" },
  { value: "referrals", label: "Referrals" },
];
const FILTERS: { value: Exclude<UserFilter, null>; label: string }[] = [
  { value: "active7", label: "Active 7d" },
  { value: "quiet14", label: "Quiet 14d+" },
  { value: "new7", label: "New" },
];

/** Checkbox semantics on purpose: the app's global style adds its own tick to any aria-pressed button. */
const Chip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) => (
  <button
    type="button"
    role="checkbox"
    aria-checked={on}
    onClick={onClick}
    className="rounded-full border border-[#E6E0D5] px-3.5 py-1.5 text-sm font-semibold text-[#23201C] transition-colors hover:border-[#23201C]/40"
    style={{ background: on ? SELECTED : "#fff" }}
  >
    {on ? "✓ " : ""}{children}
  </button>
);

export default function UsersPage() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [sort, setSort] = useState<UserSort>("last_active");
  const [filter, setFilter] = useState<UserFilter>(null);
  const [hideInternal, setHideInternal] = useState(true);

  const [rows, setRows] = useState<UserListRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  const seq = useRef(0);
  const navigate = useNavigate();

  useEffect(() => { const t = setTimeout(() => setDebounced(search), 300); return () => clearTimeout(t); }, [search]);

  const query: UserQuery = { search: debounced, sort, filter, hideInternal };

  const load = useCallback(async (offset: number, q: UserQuery) => {
    const id = ++seq.current;
    setLoading(true); setError(false);
    if (offset === 0) { setRows([]); setTotal(null); }
    try {
      const page = await fetchUsers(q, offset);
      if (id !== seq.current) return;
      setRows((prev) => (offset === 0 ? page.rows : [...prev, ...page.rows]));
      setTotal(page.total);
    } catch {
      if (id === seq.current) setError(true);
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => { load(0, { search: debounced, sort, filter, hideInternal }); }, [load, debounced, sort, filter, hideInternal]);

  const exportCsv = async () => {
    setExporting(true); setExportError(false);
    try {
      const data = await fetchUsersForCsv(query);
      downloadCsv(buildCsv(data), `logan-users-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch { setExportError(true); } finally { setExporting(false); }
  };

  const hasMore = total !== null && rows.length < total;

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[42px] font-semibold leading-none text-[#23201C]">Users</h1>
        <GhostButton onClick={exportCsv} disabled={exporting}>{exporting ? "Exporting…" : "Export CSV"}</GhostButton>
      </header>
      {exportError && <p className="text-sm text-[#23201C]">The export didn't finish. Please try again.</p>}

      <div className="space-y-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or email"
          aria-label="Search name or email"
          className="w-full rounded-full border border-[#E6E0D5] bg-white px-5 py-2.5 text-sm text-[#23201C] placeholder:text-[#6E675F] sm:max-w-sm"
        />
        <div className="flex flex-wrap items-center gap-3">
          <PillToggle<UserSort> label="Sort by" value={sort} onChange={setSort} options={SORTS} />
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filters">
            {FILTERS.map((f) => (
              <Chip key={f.value} on={filter === f.value} onClick={() => setFilter(filter === f.value ? null : f.value)}>{f.label}</Chip>
            ))}
            <Chip on={hideInternal} onClick={() => setHideInternal(!hideInternal)}>Hide internal</Chip>
          </div>
        </div>
      </div>

      <Card className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#E6E0D5] text-xs font-semibold text-[#6E675F]">
                <th className="px-5 py-3">Name</th>
                <th className="px-3 py-3">Joined</th>
                <th className="px-3 py-3">Last active</th>
                <th className="px-3 py-3 text-right">Msgs 30d</th>
                <th className="px-3 py-3 text-right">Referrals</th>
                <th className="px-5 py-3">Came from</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} onClick={() => navigate(`/admin/users/${r.id}`)} className="cursor-pointer border-b border-[#E6E0D5] last:border-0 hover:bg-[#F4F1EA]/60">
                  <td className="px-5 py-3 font-semibold">
                    <Link to={`/admin/users/${r.id}`} onClick={(e) => e.stopPropagation()} className="text-[#23201C] hover:underline">{r.name}</Link>
                    {r.internal && <span className="ml-2 rounded-full border border-[#E6E0D5] px-2 py-0.5 text-xs font-medium text-[#6E675F]">Internal</span>}
                  </td>
                  <td className="px-3 py-3 text-[#6E675F]">{fmtDate(r.joinedAt)}</td>
                  <td className="px-3 py-3 text-[#6E675F]">{relativeDay(r.lastActiveAt)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{r.msgs30d.toLocaleString("en-GB")}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{r.referrals.toLocaleString("en-GB")}</td>
                  <td className="px-5 py-3 text-[#6E675F]">{r.cameFrom}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && !error && rows.length === 0 && <p className="px-5 py-6 text-sm text-[#6E675F]">No one matches.</p>}
        {loading && rows.length === 0 && <p className="px-5 py-6 text-sm text-[#6E675F]">Loading…</p>}
        {error && (
          <p className="px-5 py-4 text-sm text-[#6E675F]">
            Couldn't load this. <button type="button" onClick={() => load(rows.length, query)} className="font-semibold text-[#23201C] underline underline-offset-2">Try again</button>
          </p>
        )}
        {hasMore && !error && (
          <div className="border-t border-[#E6E0D5] p-3 text-center">
            <GhostButton onClick={() => load(rows.length, query)} disabled={loading}>{loading ? "Loading…" : `Load ${Math.min(PAGE_SIZE, (total ?? 0) - rows.length)} more`}</GhostButton>
          </div>
        )}
      </Card>

      <p className="text-xs text-[#6E675F]">
        Showing {total === null ? "…" : total.toLocaleString("en-GB")} women. Internal accounts {hideInternal ? "hidden" : "included"}. No health data is shown in the back office.
      </p>
    </>
  );
}
