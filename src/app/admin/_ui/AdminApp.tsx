"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { OPEN_TABS, PERIOD_TABS, resolveAdminTab, type AdminTab } from "@/lib/adminTabs";
import { signInHref } from "@/lib/site";

import { AdminAuthCard, AdminShell } from "./AdminChrome";
import { AdminCommandPalette } from "./AdminCommandPalette";
import { Bars, Bones, Card, Columns, ConfirmButton, Table, Tile } from "./charts";

type Staff = { email: string; role: string };
type View = { tab: AdminTab; open: string | null; q: string; days: number; status: string };
type Flash = (msg: string, opts?: { bad?: boolean; ms?: number }) => void;

function readView(): View {
  const p = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  const tab = resolveAdminTab(p.get("tab"));
  const days = Number(p.get("days") || "30");
  return {
    tab,
    open: OPEN_TABS.has(tab) ? p.get("open") : null,
    q: p.get("q") || "",
    days: [1, 7, 30, 90, 365].includes(days) ? days : 30,
    status: p.get("status") || "open",
  };
}

function viewUrl(v: View): string {
  const p = new URLSearchParams();
  if (v.tab !== "Overview") p.set("tab", v.tab);
  if (PERIOD_TABS.has(v.tab) && v.days !== 30) p.set("days", String(v.days));
  if (v.open) p.set("open", v.open);
  if (v.q) p.set("q", v.q);
  if (v.tab === "Reports" && v.status !== "open") p.set("status", v.status);
  const qs = p.toString();
  return qs ? `/admin/?${qs}` : "/admin/";
}

function isAbort(e: unknown): boolean {
  return e instanceof DOMException ? e.name === "AbortError" : e instanceof Error && e.name === "AbortError";
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  if (r.status === 404) throw new Error("Not found");
  if (r.status === 401 || r.status === 403) throw new Error("You don't have permission for that");
  if (r.status === 429) throw new Error("Too many tries — wait a moment");
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || "Request failed");
  }
  if (r.headers.get("content-type")?.includes("text/csv")) return (await r.text()) as T;
  return (await r.json()) as T;
}

/** Local typing stays instant; the committed value updates after idle (fewer list/API hits). */
function useDebounced<T>(value: T, ms = 300): T {
  const [deferred, setDeferred] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDeferred(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return deferred;
}

async function mutate(work: () => Promise<unknown>, flash: Flash, ok: string, opts?: { ms?: number }): Promise<boolean> {
  try {
    await work();
    flash(ok, { ms: opts?.ms });
    return true;
  } catch (e) {
    flash(e instanceof Error ? e.message : "Couldn't save", { bad: true, ms: 5000 });
    return false;
  }
}

const when = (t: number) => new Date(t).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" });
const day = (t: number) => new Date(t).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });

export function AdminApp() {
  const [gate, setGate] = useState<"loading" | "signin" | "ok" | "error">("loading");
  const [staff, setStaff] = useState<Staff | null>(null);
  const [view, setView] = useState<View>({ tab: "Overview", open: null, q: "", days: 30, status: "open" });
  const [badges, setBadges] = useState<Partial<Record<string, number>>>({});
  const [toast, setToast] = useState<{ msg: string; bad?: boolean } | null>(null);
  const [badgeTick, setBadgeTick] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const toastTimer = useRef<number | null>(null);
  const refreshBadges = useCallback(() => setBadgeTick((n) => n + 1), []);

  useEffect(
    () => () => {
      if (toastTimer.current != null) window.clearTimeout(toastTimer.current);
    },
    [],
  );

  const navigate = useCallback((next: View) => {
    setView(next);
    const url = viewUrl(next);
    if (typeof window !== "undefined" && url !== window.location.pathname + window.location.search) {
      history.pushState(null, "", url);
    }
  }, []);

  useEffect(() => {
    const sync = () => setView(readView());
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  useEffect(() => {
    let live = true;
    api<{ state: string; email?: string; role?: string }>("/api/admin/session/")
      .then((body) => {
        if (!live) return;
        if (body.state === "ok") {
          setStaff({ email: body.email!, role: body.role! });
          setGate("ok");
        } else setGate("signin");
      })
      .catch(() => {
        if (live) setGate("error");
      });
    return () => {
      live = false;
    };
  }, []);

  // Badges once per session gate — not on every tab click (was doubling todo+reports traffic).
  useEffect(() => {
    if (gate !== "ok") return;
    const ac = new AbortController();
    void (async () => {
      try {
        const todo = await api<{ items: unknown[] }>("/api/admin/todo/", { signal: ac.signal });
        const reports = await api<{ reports: unknown[] }>("/api/admin/reports/?status=open", { signal: ac.signal }).catch(() => ({
          reports: [],
        }));
        setBadges({ "To Do": todo.items.length, Reports: reports.reports.length });
      } catch (e) {
        if (isAbort(e)) return;
      }
    })();
    return () => ac.abort();
  }, [gate, badgeTick]);

  const [qDraft, setQDraft] = useState(view.q);
  const [qSynced, setQSynced] = useState(view.q);
  const searchTabs = view.tab === "Households" || view.tab === "Displays";
  // Keep the draft field aligned with the URL when the tab or `q` changes (avoid setState-in-effect).
  if (searchTabs && view.q !== qSynced) {
    setQSynced(view.q);
    setQDraft(view.q);
  }
  const qDebounced = useDebounced(qDraft, 300);
  useEffect(() => {
    if (!searchTabs || qDebounced === view.q) return;
    const t = window.setTimeout(() => navigate({ ...view, q: qDebounced, open: null }), 0);
    return () => window.clearTimeout(t);
  }, [qDebounced, searchTabs, view, navigate]);

  async function signOut() {
    try {
      await api("/api/admin/signout/", { method: "POST", body: "{}" });
      setGate("signin");
      setStaff(null);
    } catch (e) {
      flash(e instanceof Error ? e.message : "Couldn't sign out", { bad: true });
    }
  }

  function flash(msg: string, opts?: { bad?: boolean; ms?: number }) {
    if (toastTimer.current != null) window.clearTimeout(toastTimer.current);
    setToast({ msg, bad: opts?.bad });
    const ms = opts?.ms ?? (opts?.bad ? 5000 : 3500);
    toastTimer.current = window.setTimeout(() => setToast(null), ms);
  }

  if (gate === "loading") {
    return (
      <AdminAuthCard title="Everydaypane admin">
        <Bones lines={3} />
      </AdminAuthCard>
    );
  }
  if (gate === "error") {
    return (
      <AdminAuthCard title="Couldn't open admin" sub="The database may be down. Reload in a moment.">
        <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
          Reload
        </button>
      </AdminAuthCard>
    );
  }
  if (gate === "signin") return <SignIn />;

  const tools = (
    <div className="flex flex-wrap items-center gap-2">
      {searchTabs && (
        <input
          className="field max-w-[14rem]"
          placeholder={view.tab === "Households" ? "Name, email, id…" : "Name, household, id…"}
          value={qDraft}
          onChange={(e) => setQDraft(e.target.value)}
          aria-label={view.tab === "Households" ? "Search households" : "Search displays"}
        />
      )}
      {PERIOD_TABS.has(view.tab) && (
        <div className="flex rounded-lg border border-line bg-panel p-0.5 text-xs font-semibold" role="group" aria-label="Period">
          {[7, 30, 90, 365].map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={view.days === d}
              className={`rounded-md px-2.5 py-1.5 ${view.days === d ? "bg-brand text-brand-ink" : "text-soft hover:text-ink"}`}
              onClick={() => navigate({ ...view, days: d })}
            >
              {d === 365 ? "1y" : `${d}d`}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        className="btn-ghost text-xs font-semibold"
        onClick={() => setPaletteOpen(true)}
        title="Command palette (⌘K)"
        aria-keyshortcuts="Meta+K Control+K"
      >
        <kbd className="rounded border border-line px-1.5 py-0.5">⌘K</kbd>
      </button>
    </div>
  );

  return (
    <>
      <AdminShell
        tab={view.tab}
        badges={badges}
        staff={staff ?? undefined}
        onSignOut={() => void signOut()}
        onTab={(tab) =>
          navigate({ tab, open: null, q: tab === "Households" || tab === "Displays" ? view.q : "", days: view.days, status: "open" })
        }
        tools={tools}
      >
        {toast ? (
          <p
            className={`mt-3 rounded-xl px-3 py-2 text-sm font-semibold ${toast.bad ? "bg-bad/15 text-bad" : "bg-good/15 text-good"}`}
            role="status"
          >
            {toast.msg}
          </p>
        ) : null}
        <div className="mt-4 grid gap-4">
          <TabBody view={view} navigate={navigate} staff={staff!} flash={flash} refreshBadges={refreshBadges} />
        </div>
      </AdminShell>
      <AdminCommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onGoTab={(tab) =>
          navigate({ tab, open: null, q: tab === "Households" || tab === "Displays" ? view.q : "", days: view.days, status: "open" })
        }
        onOpenHousehold={(id) => navigate({ tab: "Households", open: id, q: "", days: view.days, status: "open" })}
      />
    </>
  );
}

function SignIn() {
  useEffect(() => {
    window.location.replace(signInHref("/admin/"));
  }, []);
  return (
    <AdminAuthCard title="Staff sign-in" sub="Redirecting to Everydaypane sign-in. Only ADMIN_EMAILS can open this panel.">
      <a className="btn-primary" href={signInHref("/admin/")}>
        Continue to sign-in
      </a>
    </AdminAuthCard>
  );
}

function TabBody({
  view,
  navigate,
  staff,
  flash,
  refreshBadges,
}: {
  view: View;
  navigate: (v: View) => void;
  staff: Staff;
  flash: Flash;
  refreshBadges: () => void;
}) {
  switch (view.tab) {
    case "Overview":
      return <OverviewTab days={view.days} onJump={(tab) => navigate({ ...view, tab: resolveAdminTab(tab), open: null })} />;
    case "To Do":
      return <TodoTab flash={flash} refreshBadges={refreshBadges} />;
    case "Inbox":
      return <InboxTab />;
    case "Reports":
      return (
        <ReportsTab status={view.status} onStatus={(s) => navigate({ ...view, status: s })} flash={flash} refreshBadges={refreshBadges} />
      );
    case "Traffic":
      return <TrafficTab days={view.days} />;
    case "Devices":
      return <DevicesMetricsTab days={view.days} />;
    case "Revenue":
      return <RevenueTab flash={flash} canWrite={staff.role === "admin"} />;
    case "Codes":
      return <CodesTab flash={flash} canWrite={staff.role === "admin"} />;
    case "Households":
      return (
        <HouseholdsTab
          q={view.q}
          open={view.open}
          canWrite={staff.role === "admin"}
          onOpen={(id) => navigate({ ...view, open: id })}
          onClose={() => navigate({ ...view, open: null })}
          onOpenDisplay={(id) => navigate({ tab: "Displays", open: id, q: "", days: view.days, status: "open" })}
          flash={flash}
        />
      );
    case "Displays":
      return (
        <DisplaysTab
          q={view.q}
          open={view.open}
          canWrite={staff.role === "admin"}
          onOpen={(id) => navigate({ ...view, open: id })}
          onClose={() => navigate({ ...view, open: null })}
          onOpenHousehold={(accountId) => navigate({ tab: "Households", open: accountId, q: "", days: view.days, status: "open" })}
          flash={flash}
        />
      );
    case "Flags":
      return <FlagsTab flash={flash} canWrite={staff.role === "admin"} />;
    case "Automations":
      return <AutomationsTab flash={flash} canWrite={staff.role === "admin"} />;
    case "System":
      return <SystemTab />;
    case "Log":
      return <LogTab />;
    default:
      return <p className="text-soft">Unknown tab.</p>;
  }
}

function useFetch<T>(path: string, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  useEffect(() => {
    if (!path) return;
    const ac = new AbortController();
    void api<T>(path, { signal: ac.signal })
      .then((body) => {
        setData(body);
        setError("");
      })
      .catch((e) => {
        if (isAbort(e)) return;
        setError(e instanceof Error ? e.message : "Failed");
      });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tick, ...deps]);
  return { data, error, reload };
}

function OverviewTab({ days, onJump }: { days: number; onJump: (t: string) => void }) {
  const { data, error } = useFetch<{
    signups: number;
    signupsDelta: number | null;
    displays: number;
    displaysDelta: number | null;
    free: number;
    paid: number;
    grossMrr: number;
    needsYou: { key: string; title: string; detail: string; href?: string }[];
    dailySignups: { day: string; n: number }[];
  }>(`/api/admin/overview/?days=${days}`, [days]);
  if (error) return <p className="text-bad">{error}</p>;
  if (!data) return <Bones />;
  const jumps = [
    { tab: "To Do", label: "To Do" },
    { tab: "Households", label: "Households" },
    { tab: "Traffic", label: "Traffic" },
    { tab: "Revenue", label: "Revenue" },
  ] as const;
  return (
    <>
      {data.needsYou.length > 0 ? (
        <Card title="Needs you" sub="Do these before the numbers">
          <ul className="grid gap-2">
            {data.needsYou.map((n) => (
              <li key={n.key} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-bg px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold">{n.title}</p>
                  <p className="text-soft">{n.detail}</p>
                </div>
                {n.href ? (
                  <button type="button" className="btn-ghost text-sm" onClick={() => onJump(n.href!)}>
                    Open
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <p className="rounded-xl border border-line bg-panel px-3 py-2 text-sm text-soft">Nothing waiting — cockpit is clear.</p>
      )}
      <div className="flex flex-wrap gap-1">
        {jumps.map((j) => (
          <button key={j.tab} type="button" className="btn-ghost text-sm" onClick={() => onJump(j.tab)}>
            {j.label}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="New households" value={String(data.signups)} delta={data.signupsDelta} />
        <Tile label="New displays" value={String(data.displays)} delta={data.displaysDelta} />
        <Tile label="Free / Household" value={`${data.free} / ${data.paid}`} />
        <Tile label="Est. gross MRR" value={`$${data.grossMrr}`} hint="USD" />
      </div>
      <FunnelPanel days={days} />
      <Card title="Sign-ups a day">
        <Columns days={data.dailySignups} />
      </Card>
    </>
  );
}

function TodoTab({ flash, refreshBadges }: { flash: Flash; refreshBadges: () => void }) {
  const { data, reload, error } = useFetch<{
    items: { key: string; title: string; detail: string; kind: string }[];
    tasks: { id: string; text: string; dueAt: number | null }[];
  }>("/api/admin/todo/");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  if (error) return <p className="text-bad">{error}</p>;
  if (!data) return <Bones />;
  return (
    <>
      <Card title="From the product" sub="Things Everydaypane noticed — snooze or dismiss">
        <ul className="grid gap-2">
          {data.items.length === 0 && <li className="text-sm text-soft">Nothing the product is flagging.</li>}
          {data.items.map((i) => (
            <li key={i.key} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="font-semibold">{i.title}</p>
                <p className="text-soft">{i.detail}</p>
              </div>
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  className="btn-ghost text-xs disabled:opacity-50"
                  disabled={busy === i.key}
                  onClick={() => {
                    setBusy(i.key);
                    void mutate(
                      () =>
                        api("/api/admin/todo/", {
                          method: "POST",
                          body: JSON.stringify({ op: "hide", key: i.key, until: "tomorrow" }),
                        }),
                      flash,
                      "Snoozed until tomorrow",
                    ).then((ok) => {
                      setBusy(null);
                      if (ok) {
                        reload();
                        refreshBadges();
                      }
                    });
                  }}
                >
                  Tomorrow
                </button>
                <ConfirmButton
                  label="Dismiss"
                  confirm="Tap again: dismiss"
                  variant="ghost"
                  busy={busy === i.key}
                  onConfirm={() => {
                    setBusy(i.key);
                    void mutate(
                      () =>
                        api("/api/admin/todo/", {
                          method: "POST",
                          body: JSON.stringify({ op: "hide", key: i.key, dismiss: true }),
                        }),
                      flash,
                      "Dismissed",
                    ).then((ok) => {
                      setBusy(null);
                      if (ok) {
                        reload();
                        refreshBadges();
                      }
                    });
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Your tasks" sub="Private checklist for staff — not shown to households">
        <form
          className="mb-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setBusy("add");
            void mutate(
              () => api("/api/admin/todo/", { method: "POST", body: JSON.stringify({ op: "add", text }) }),
              flash,
              "Task added",
            ).then((ok) => {
              setBusy(null);
              if (ok) {
                setText("");
                reload();
              }
            });
          }}
        >
          <label className="sr-only" htmlFor="admin-task">
            New task
          </label>
          <input
            id="admin-task"
            className="field flex-1"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Follow up on billing"
            required
          />
          <button type="submit" className="btn-primary disabled:opacity-50" disabled={busy === "add"}>
            {busy === "add" ? "…" : "Add"}
          </button>
        </form>
        <ul className="grid gap-2">
          {data.tasks.length === 0 && <li className="text-sm text-soft">No personal tasks yet.</li>}
          {data.tasks.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 break-words">{t.text}</span>
              <button
                type="button"
                className="btn-ghost text-xs disabled:opacity-50"
                disabled={busy === t.id}
                onClick={() => {
                  setBusy(t.id);
                  void mutate(
                    () => api("/api/admin/todo/", { method: "POST", body: JSON.stringify({ op: "done", id: t.id }) }),
                    flash,
                    "Done",
                  ).then((ok) => {
                    setBusy(null);
                    if (ok) reload();
                  });
                }}
              >
                Done
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

function InboxTab() {
  const { data, error } = useFetch<{ configured: boolean; setup: string[]; note?: string; waiting: number }>("/api/admin/inbox/");
  if (error) return <p className="text-bad">{error}</p>;
  if (!data) return <Bones />;
  return (
    <Card title="Inbox" sub={data.configured ? "Receiving customer email" : "Email inbox not set up yet"}>
      {!data.configured ? (
        <>
          <p className="mb-3 text-sm text-soft">Finish these steps so mail to Everydaypane lands here.</p>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-soft">
            {data.setup.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </>
      ) : (
        <p className="text-sm text-soft">
          {data.note || (data.waiting > 0 ? `${data.waiting} message${data.waiting === 1 ? "" : "s"} waiting to be read.` : "No new mail.")}
        </p>
      )}
    </Card>
  );
}

function ReportsTab({
  status,
  onStatus,
  flash,
  refreshBadges,
}: {
  status: string;
  onStatus: (s: string) => void;
  flash: Flash;
  refreshBadges: () => void;
}) {
  const { data, reload, error } = useFetch<{
    reports: { id: string; text: string; email: string | null; status: string; createdAt: number }[];
  }>(`/api/admin/reports/?status=${status}`, [status]);
  const [busy, setBusy] = useState<string | null>(null);
  if (error) return <p className="text-bad">{error}</p>;
  if (!data) return <Bones />;
  return (
    <>
      <div className="flex flex-wrap gap-1">
        {["open", "done", "dismissed", "all"].map((s) => (
          <button
            key={s}
            type="button"
            className={`btn-ghost capitalize ${status === s ? "border-brand text-brand" : ""}`}
            onClick={() => onStatus(s)}
          >
            {s === "open" ? "To read" : s}
          </button>
        ))}
      </div>
      <ul className="grid gap-3">
        {data.reports.length === 0 && (
          <li className="text-sm text-soft">
            {status === "open" ? "No open reports." : status === "all" ? "No reports yet." : `No ${status} reports.`}
          </li>
        )}
        {data.reports.map((r) => (
          <li key={r.id} className="rounded-2xl border border-line bg-panel p-4">
            <p className="text-xs text-soft">
              {day(r.createdAt)}
              {r.email ? ` · ${r.email}` : ""}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm">{r.text}</p>
            {r.status === "open" && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-primary text-sm disabled:opacity-50"
                  disabled={busy === r.id}
                  onClick={() => {
                    setBusy(r.id);
                    void mutate(
                      () => api("/api/admin/reports/", { method: "POST", body: JSON.stringify({ id: r.id, status: "done" }) }),
                      flash,
                      "Marked done",
                    ).then((ok) => {
                      setBusy(null);
                      if (ok) {
                        reload();
                        refreshBadges();
                      }
                    });
                  }}
                >
                  {busy === r.id ? "…" : "Done"}
                </button>
                <ConfirmButton
                  label="Dismiss"
                  confirm="Tap again: dismiss"
                  busy={busy === r.id}
                  onConfirm={() => {
                    setBusy(r.id);
                    void mutate(
                      () => api("/api/admin/reports/", { method: "POST", body: JSON.stringify({ id: r.id, status: "dismissed" }) }),
                      flash,
                      "Dismissed",
                    ).then((ok) => {
                      setBusy(null);
                      if (ok) {
                        reload();
                        refreshBadges();
                      }
                    });
                  }}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function TrafficTab({ days }: { days: number }) {
  const traffic = useFetch<{
    visitors: number;
    views: number;
    visitorsDelta: number | null;
    viewsDelta: number | null;
    daily: { day: string; n: number }[];
    pages: { label: string; value: number }[];
    referrers: { label: string; value: number }[];
    sources: { label: string; value: number }[];
    tracks: { label: string; value: number }[];
  }>(`/api/admin/traffic/?days=${days}`, [days]);
  const acquis = useFetch<{
    signups: number;
    displays: number;
    sources: { label: string; value: number }[];
    campaigns: { label: string; value: number }[];
    countries: { label: string; value: number }[];
  }>(`/api/admin/acquisition/?days=${days}`, [days]);
  if (traffic.error) return <p className="text-bad">{traffic.error}</p>;
  if (!traffic.data) return <Bones />;
  const data = traffic.data;
  const acq = acquis.data;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Visitors" value={String(data.visitors)} delta={data.visitorsDelta} />
        <Tile label="Page views" value={String(data.views)} delta={data.viewsDelta} />
        <Tile label="Households created" value={acq ? String(acq.signups) : "…"} />
        <Tile label="Displays created" value={acq ? String(acq.displays) : "…"} />
      </div>
      <Card title="Visitors a day">
        <Columns days={data.daily} />
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Pages">
          <Bars items={data.pages} />
        </Card>
        <Card title="Referrers">
          <Bars items={data.referrers} />
        </Card>
        <Card title="Site sources">
          <Bars items={data.sources} />
        </Card>
        <Card title="Button clicks">
          <Bars items={data.tracks} />
        </Card>
      </div>
      {acquis.error ? (
        <p className="text-sm text-bad">{acquis.error}</p>
      ) : acq ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Household sources">
            <Bars items={acq.sources} />
          </Card>
          <Card title="Campaigns">
            <Bars items={acq.campaigns} />
          </Card>
          <Card title="Countries">
            <Bars items={acq.countries} />
          </Card>
        </div>
      ) : (
        <Bones lines={2} />
      )}
      <Card title="Organic search" sub="Optional — add keys in Vercel when you want this here">
        <p className="text-sm text-soft">Until then, check Google Search Console or Bing Webmaster for search traffic.</p>
      </Card>
    </>
  );
}

function FunnelPanel({ days }: { days: number }) {
  const { data, error } = useFetch<{ steps: { label: string; n: number }[]; biggest: { from: string; to: string; drop: number } | null }>(
    `/api/admin/funnel/?days=${days}`,
    [days],
  );
  if (error) return <p className="text-sm text-bad">{error}</p>;
  if (!data) return <Bones lines={3} />;
  const first = data.steps[0]?.n || 1;
  return (
    <Card title="Getting going → paid">
      {data.biggest ? (
        <p className="mb-3 rounded-xl bg-sun/15 px-3 py-2 text-sm">
          Biggest drop: {data.biggest.from} → {data.biggest.to} (−{data.biggest.drop})
        </p>
      ) : null}
      <ul className="grid gap-3">
        {data.steps.map((s, i) => {
          const prev = i === 0 ? s.n : data.steps[i - 1]!.n;
          return (
            <li key={s.label}>
              <div className="mb-1 flex justify-between gap-2 text-sm">
                <span className="min-w-0 font-semibold">{s.label}</span>
                <span className="shrink-0 tabular-nums text-soft">
                  {s.n} · {Math.round((s.n / first) * 100)}%{i > 0 ? ` · ${prev ? Math.round((s.n / prev) * 100) : 0}% step` : ""}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-bg">
                <div className="h-full rounded-full bg-brand" style={{ width: `${(s.n / first) * 100}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function DevicesMetricsTab({ days }: { days: number }) {
  const { data, error } = useFetch<{
    devices: { label: string; value: number }[];
    browsers: { label: string; value: number }[];
    os: { label: string; value: number }[];
    displaysCreated: number;
  }>(`/api/admin/devices/?breakdown=1&days=${days}`, [days]);
  if (error) return <p className="text-bad">{error}</p>;
  if (!data) return <Bones />;
  return (
    <>
      <Tile label="Displays created" value={String(data.displaysCreated)} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Device type">
          <Bars items={data.devices} />
        </Card>
        <Card title="Browsers">
          <Bars items={data.browsers} />
        </Card>
        <Card title="OS">
          <Bars items={data.os} />
        </Card>
      </div>
    </>
  );
}

function RevenueTab({ flash, canWrite }: { flash: Flash; canWrite: boolean }) {
  const { data, reload, error } = useFetch<{
    free: number;
    paid: number;
    stripeLinked: number;
    grossMrr: number;
    netMrr: number;
    costs: { id: string; name: string; amount: number; period: "month" | "year" }[];
    costsMonth: number;
    profitMonth: number;
  }>("/api/admin/revenue/");
  const [draft, setDraft] = useState<{ id: string; name: string; amount: number; period: "month" | "year" }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const costs = draft ?? data?.costs ?? [];
  if (error) return <p className="text-bad">{error}</p>;
  if (!data) return <Bones />;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Household plans" value={String(data.paid)} />
        <Tile label="Stripe-linked" value={String(data.stripeLinked)} />
        <Tile label="Gross MRR" value={`$${data.grossMrr}`} />
        <Tile label="Profit / month" value={`$${data.profitMonth}`} hint={`costs $${data.costsMonth}`} />
      </div>
      <Card title="Running costs" sub="Typed by staff; yearly fees count as a twelfth">
        {costs.map((c, i) => (
          <div key={c.id || i} className="mb-2 flex flex-wrap gap-2">
            <input
              className="field min-w-0 flex-1"
              value={c.name}
              disabled={!canWrite || busy}
              onChange={(e) => setDraft(costs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
            />
            <input
              className="field w-24"
              type="number"
              value={c.amount}
              disabled={!canWrite || busy}
              onChange={(e) => setDraft(costs.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) } : x)))}
            />
            <select
              className="field w-28"
              value={c.period}
              disabled={!canWrite || busy}
              onChange={(e) => setDraft(costs.map((x, j) => (j === i ? { ...x, period: e.target.value as "month" | "year" } : x)))}
            >
              <option value="month">/ month</option>
              <option value="year">/ year</option>
            </select>
          </div>
        ))}
        {canWrite && (
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="btn-ghost"
              disabled={busy}
              onClick={() => setDraft([...costs, { id: `c${Date.now()}`, name: "", amount: 0, period: "month" }])}
            >
              Add cost
            </button>
            <button
              type="button"
              className="btn-primary disabled:opacity-50"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void mutate(() => api("/api/admin/revenue/", { method: "POST", body: JSON.stringify({ costs }) }), flash, "Saved").then(
                  (ok) => {
                    setBusy(false);
                    if (ok) {
                      setDraft(null);
                      reload();
                    }
                  },
                );
              }}
            >
              {busy ? "Saving…" : "Save costs"}
            </button>
          </div>
        )}
      </Card>
    </>
  );
}

function CodesTab({ flash, canWrite }: { flash: Flash; canWrite: boolean }) {
  const { data, reload, error } = useFetch<{
    codes: { code: string; kind: string; maxUses: number; used: number; enabled: boolean; note: string | null }[];
  }>("/api/admin/codes/");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  if (error) return <p className="text-bad">{error}</p>;
  if (!data) return <Bones />;
  return (
    <>
      {canWrite && (
        <Card title="Create Household code" sub="One upgrade redeem — until used or you disable it">
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setBusy("create");
              void (async () => {
                try {
                  const r = await api<{ code: string }>("/api/admin/codes/", {
                    method: "POST",
                    body: JSON.stringify({ op: "create", kind: "household", maxUses: 1, note }),
                  });
                  flash(`Created ${r.code}`, { ms: 5000 });
                  setNote("");
                  reload();
                } catch (err) {
                  flash(err instanceof Error ? err.message : "Couldn't create", { bad: true, ms: 5000 });
                } finally {
                  setBusy(null);
                }
              })();
            }}
          >
            <label className="sr-only" htmlFor="admin-code-note">
              Internal note
            </label>
            <input
              id="admin-code-note"
              className="field min-w-0 flex-1"
              placeholder="Why you made this (staff only)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={busy === "create"}
            />
            <button type="submit" className="btn-primary disabled:opacity-50" disabled={busy === "create"}>
              {busy === "create" ? "Creating…" : "Create code"}
            </button>
          </form>
        </Card>
      )}
      <Card title="Codes" sub="Disable stops new redemptions; past uses stay">
        {data.codes.length === 0 ? (
          <p className="text-sm text-soft">No codes yet. Create one when you want to grant Household without Stripe.</p>
        ) : (
          <Table
            headers={["Code", "Kind", "Used", "Note", ""]}
            rows={data.codes.map((c) => [
              <span key="c" className="font-mono">
                {c.code}
              </span>,
              c.kind,
              `${c.used}/${c.maxUses}`,
              c.note || "—",
              canWrite ? (
                <ConfirmButton
                  key="t"
                  label={c.enabled ? "Disable" : "Enable"}
                  confirm={c.enabled ? "Tap again: stop redemptions" : "Tap again: allow redemptions"}
                  variant={c.enabled ? "danger" : "ghost"}
                  busy={busy === c.code}
                  onConfirm={() => {
                    setBusy(c.code);
                    void mutate(
                      () => api("/api/admin/codes/", { method: "POST", body: JSON.stringify({ code: c.code, enabled: !c.enabled }) }),
                      flash,
                      c.enabled ? "Code disabled — no new redemptions" : "Code enabled again",
                      { ms: 4000 },
                    ).then((ok) => {
                      setBusy(null);
                      if (ok) reload();
                    });
                  }}
                />
              ) : c.enabled ? (
                "Live"
              ) : (
                "Off"
              ),
            ])}
          />
        )}
      </Card>
    </>
  );
}

function HouseholdsTab({
  q,
  open,
  onOpen,
  onClose,
  onOpenDisplay,
  canWrite,
  flash,
}: {
  q: string;
  open: string | null;
  onOpen: (id: string) => void;
  onClose: () => void;
  onOpenDisplay: (id: string) => void;
  canWrite: boolean;
  flash: Flash;
}) {
  const path = useMemo(() => `/api/admin/households/?q=${encodeURIComponent(q)}`, [q]);
  const { data, reload, error } = useFetch<{
    households: {
      id: string;
      name: string;
      plan: string;
      createdAt: number;
      deviceCount: number;
      members: { email: string; role: string }[];
      hasStripe: boolean;
    }[];
  }>(path, [q]);
  const detail = useFetch<{
    household: {
      id: string;
      name: string;
      plan: string;
      stripeCustomerId: string | null;
      stripeSubscriptionId: string | null;
      members: { email: string; role: string }[];
      devices: { id: string; name: string; lastSeenAt: number | null; isTest: boolean }[];
      notes: { id: string; admin: string; text: string; createdAt: number }[];
      configVersion: number | null;
    };
  }>(open ? `/api/admin/households/?id=${encodeURIComponent(open)}` : "", [open]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkNote, setBulkNote] = useState("");
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);
  const [selectedForQ, setSelectedForQ] = useState(q);
  if (q !== selectedForQ) {
    setSelectedForQ(q);
    setSelected(new Set());
    setBulkNote("");
  }

  if (open) {
    const h = detail.data?.household;
    return (
      <Card
        title={h?.name || "Household"}
        sub={open}
        right={
          <button type="button" className="btn-ghost" onClick={onClose}>
            Back
          </button>
        }
      >
        {detail.error && <p className="text-bad">{detail.error}</p>}
        {!h && !detail.error && <Bones />}
        {h && (
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Tile label="Plan" value={h.plan === "paid" ? "Household" : "Free"} />
              <Tile label="Displays" value={String(h.devices.length)} />
              <Tile label="Config" value={h.configVersion != null ? `v${h.configVersion}` : "—"} />
            </div>
            <p className="text-sm text-soft">
              Stripe customer: <span className="font-mono">{h.stripeCustomerId || "—"}</span>
              <br />
              Subscription: <span className="font-mono">{h.stripeSubscriptionId || "—"}</span>
            </p>
            <div>
              <h4 className="font-bold">Members</h4>
              <p className="text-sm text-soft">{h.members.map((m) => `${m.email} (${m.role})`).join(", ") || "—"}</p>
            </div>
            <div>
              <h4 className="font-bold">Displays</h4>
              <ul className="grid gap-1 text-sm">
                {h.devices.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-baseline justify-between gap-2">
                    <span>
                      {d.name} <span className="font-mono text-xs text-soft">{d.id}</span>
                      {d.isTest ? " · test" : ""}
                      {d.lastSeenAt ? ` · seen ${day(d.lastSeenAt)}` : ""}
                    </span>
                    <button type="button" className="btn-ghost text-xs" onClick={() => onOpenDisplay(d.id)}>
                      Open display
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            {canWrite && (
              <div className="grid gap-2">
                <p className="text-sm text-soft">
                  {h.plan === "paid"
                    ? "Move to Free locks paid widgets and extras on every display for this household. Stripe stays linked if they had billing."
                    : "Grant Household unlocks every paid widget and setting for this household without a Stripe charge."}{" "}
                  Written to the audit log.
                </p>
                <ConfirmButton
                  label={h.plan === "paid" ? "Move to Free" : "Grant Household"}
                  confirm={h.plan === "paid" ? `Tap again: ${h.name} → Free` : `Tap again: ${h.name} → Household`}
                  variant={h.plan === "paid" ? "danger" : "primary"}
                  busy={busy === "plan"}
                  onConfirm={() => {
                    setBusy("plan");
                    void mutate(
                      () =>
                        api("/api/admin/households/", {
                          method: "POST",
                          body: JSON.stringify({ op: "plan", id: h.id, plan: h.plan === "paid" ? "free" : "paid" }),
                        }),
                      flash,
                      h.plan === "paid" ? `${h.name} is now Free` : `${h.name} is now Household`,
                      { ms: 5000 },
                    ).then((ok) => {
                      setBusy(null);
                      if (ok) {
                        detail.reload();
                        reload();
                      }
                    });
                  }}
                />
              </div>
            )}
            <div>
              <h4 className="font-bold">Notes</h4>
              <ul className="mb-2 grid gap-2 text-sm">
                {h.notes.map((n) => (
                  <li key={n.id} className="rounded-lg bg-bg px-2 py-1">
                    <span className="text-xs text-soft">
                      {n.admin} · {when(n.createdAt)}
                    </span>
                    <p className="break-words">{n.text}</p>
                  </li>
                ))}
              </ul>
              {canWrite && (
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!note.trim()) return;
                    setBusy("note");
                    void mutate(
                      () => api("/api/admin/households/", { method: "POST", body: JSON.stringify({ op: "note", id: h.id, text: note }) }),
                      flash,
                      "Note added",
                    ).then((ok) => {
                      setBusy(null);
                      if (ok) {
                        setNote("");
                        detail.reload();
                      }
                    });
                  }}
                >
                  <input
                    className="field min-w-0 flex-1"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Private note"
                    disabled={busy === "note"}
                  />
                  <button type="submit" className="btn-primary disabled:opacity-50" disabled={busy === "note"}>
                    {busy === "note" ? "…" : "Add"}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}
      </Card>
    );
  }

  if (error) return <p className="text-bad">{error}</p>;
  if (!data) return <Bones />;

  const ids = data.households.map((h) => h.id);
  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
  const selectedCount = selected.size;

  async function runBulk(op: "plan" | "note", payload: { plan?: "free" | "paid"; text?: string }) {
    const list = [...selected];
    if (list.length === 0) return;
    setBulkBusy(op);
    let failed = 0;
    for (const id of list) {
      try {
        await api("/api/admin/households/", {
          method: "POST",
          body: JSON.stringify(op === "plan" ? { op: "plan", id, plan: payload.plan } : { op: "note", id, text: payload.text }),
        });
      } catch {
        failed += 1;
      }
    }
    setBulkBusy(null);
    const done = list.length - failed;
    if (failed) flash(`Updated ${done}; ${failed} failed`, { bad: true, ms: 5000 });
    else if (op === "plan") flash(payload.plan === "paid" ? `Granted Household to ${done}` : `Moved ${done} to Free`, { ms: 5000 });
    else flash(`Note added to ${done}`);
    setSelected(new Set());
    setBulkNote("");
    reload();
  }

  return (
    <Card
      title="Households"
      right={
        <button
          type="button"
          className="btn-ghost text-sm"
          onClick={() =>
            void fetch("/api/admin/export/?type=households")
              .then(async (r) => {
                const blob = await r.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "everydaypane-households.csv";
                a.click();
                URL.revokeObjectURL(url);
              })
              .catch(() => undefined)
          }
        >
          CSV
        </button>
      }
    >
      {canWrite && selectedCount > 0 ? (
        <div className="mb-3 grid gap-2 rounded-xl border border-line bg-bg px-3 py-3">
          <p className="text-sm font-semibold">
            {selectedCount} selected
            <button type="button" className="btn-ghost ml-2 text-xs" onClick={() => setSelected(new Set())}>
              Clear
            </button>
          </p>
          <div className="flex flex-wrap gap-2">
            <ConfirmButton
              label="Grant Household"
              confirm={`Tap again: grant Household to ${selectedCount}`}
              variant="primary"
              busy={bulkBusy === "plan"}
              disabled={bulkBusy != null}
              onConfirm={() => void runBulk("plan", { plan: "paid" })}
            />
            <ConfirmButton
              label="Move to Free"
              confirm={`Tap again: move ${selectedCount} to Free`}
              variant="danger"
              busy={bulkBusy === "plan"}
              disabled={bulkBusy != null}
              onConfirm={() => void runBulk("plan", { plan: "free" })}
            />
          </div>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!bulkNote.trim() || bulkBusy) return;
              void runBulk("note", { text: bulkNote.trim() });
            }}
          >
            <input
              className="field min-w-0 flex-1"
              value={bulkNote}
              onChange={(e) => setBulkNote(e.target.value)}
              placeholder="Private note for all selected"
              disabled={bulkBusy != null}
            />
            <button type="submit" className="btn-primary disabled:opacity-50" disabled={!bulkNote.trim() || bulkBusy != null}>
              {bulkBusy === "note" ? "…" : "Add note"}
            </button>
          </form>
        </div>
      ) : null}
      <Table
        headers={canWrite ? ["", "Name", "Plan", "Displays", "Members", ""] : ["Name", "Plan", "Displays", "Members", ""]}
        rows={data.households.map((h) => {
          const openBtn = (
            <button key="o" type="button" className="btn-ghost text-sm" onClick={() => onOpen(h.id)}>
              Open
            </button>
          );
          const cells: ReactNode[] = [
            <div key="n">
              <p className="font-semibold">{h.name}</p>
              <p className="font-mono text-xs text-soft">{h.id}</p>
            </div>,
            `${h.plan === "paid" ? "Household" : "Free"}${h.hasStripe ? " · Stripe" : ""}`,
            String(h.deviceCount),
            h.members.map((m) => m.email).join(", ") || "—",
            openBtn,
          ];
          if (canWrite) {
            cells.unshift(
              <input
                key="c"
                type="checkbox"
                checked={selected.has(h.id)}
                aria-label={`Select ${h.name}`}
                onChange={() => {
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(h.id)) next.delete(h.id);
                    else next.add(h.id);
                    return next;
                  });
                }}
              />,
            );
          }
          return cells;
        })}
      />
      {canWrite && ids.length > 0 ? (
        <p className="mt-2 text-xs text-soft">
          <button type="button" className="btn-ghost text-xs" onClick={() => setSelected(allSelected ? new Set() : new Set(ids))}>
            {allSelected ? "Deselect page" : "Select page"}
          </button>
        </p>
      ) : null}
    </Card>
  );
}

function DisplaysTab({
  q,
  open,
  onOpen,
  onClose,
  onOpenHousehold,
  canWrite,
  flash,
}: {
  q: string;
  open: string | null;
  onOpen: (id: string) => void;
  onClose: () => void;
  onOpenHousehold: (accountId: string) => void;
  canWrite: boolean;
  flash: Flash;
}) {
  const { data, reload, error } = useFetch<{
    displays: {
      id: string;
      name: string;
      accountId: string;
      accountName: string;
      createdAt: number;
      lastSeenAt: number | null;
      isTest: boolean;
    }[];
  }>(`/api/admin/devices/?q=${encodeURIComponent(q)}&tests=1`, [q]);
  const detail = useFetch<{
    display: {
      id: string;
      name: string;
      accountId: string;
      accountName: string;
      isTest: boolean;
      lastSeenAt: number | null;
      createdAt: number;
    };
  }>(open ? `/api/admin/devices/?id=${encodeURIComponent(open)}` : "", [open]);
  const [busy, setBusy] = useState(false);

  if (open) {
    const d = detail.data?.display;
    return (
      <Card
        title={d?.name || "Display"}
        right={
          <button type="button" className="btn-ghost" onClick={onClose}>
            Back
          </button>
        }
      >
        {!d && <Bones />}
        {d && (
          <div className="grid gap-3 text-sm">
            <p>
              <span className="font-mono">{d.id}</span>
            </p>
            <p>
              Household: {d.accountName} <span className="font-mono text-xs">({d.accountId})</span>
            </p>
            <p>Created {day(d.createdAt)}</p>
            <p>Last seen {d.lastSeenAt ? when(d.lastSeenAt) : "—"}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary" onClick={() => onOpenHousehold(d.accountId)}>
                Open household
              </button>
              {canWrite && (
                <ConfirmButton
                  label={d.isTest ? "Unmark test" : "Mark as test"}
                  confirm={d.isTest ? "Tap again: unmark test" : "Tap again: mark test"}
                  variant="primary"
                  busy={busy}
                  onConfirm={() => {
                    setBusy(true);
                    void mutate(
                      () => api("/api/admin/devices/", { method: "POST", body: JSON.stringify({ id: d.id, isTest: !d.isTest }) }),
                      flash,
                      d.isTest ? "Unmarked test" : "Marked test",
                    ).then((ok) => {
                      setBusy(false);
                      if (ok) {
                        detail.reload();
                        reload();
                      }
                    });
                  }}
                />
              )}
            </div>
            <p className="text-xs text-soft">Staff can’t open the live wall as that household — Open household is the safe preview cue.</p>
          </div>
        )}
      </Card>
    );
  }

  if (error) return <p className="text-bad">{error}</p>;
  if (!data) return <Bones />;
  return (
    <Card title="Displays">
      <Table
        headers={["Name", "Household", "Last seen", ""]}
        rows={data.displays.map((d) => [
          <div key="n">
            {d.name}
            {d.isTest ? <span className="ml-1 text-xs text-soft">test</span> : null}
            <p className="font-mono text-xs text-soft">{d.id}</p>
          </div>,
          <button
            key="h"
            type="button"
            className="text-left font-semibold text-brand hover:underline"
            onClick={() => onOpenHousehold(d.accountId)}
          >
            {d.accountName}
          </button>,
          d.lastSeenAt ? day(d.lastSeenAt) : "—",
          <div key="a" className="flex flex-wrap gap-1">
            <button type="button" className="btn-ghost text-sm" onClick={() => onOpen(d.id)}>
              Open
            </button>
            <button type="button" className="btn-ghost text-sm" onClick={() => onOpenHousehold(d.accountId)}>
              Household
            </button>
          </div>,
        ])}
      />
    </Card>
  );
}

function FlagsTab({ flash, canWrite }: { flash: Flash; canWrite: boolean }) {
  const { data, reload, error } = useFetch<{
    flags: { name: string; label: string; description: string; value: boolean; share: number; fromDefault: boolean; group: string }[];
  }>("/api/admin/flags/");
  const [busy, setBusy] = useState<string | null>(null);
  if (error) return <p className="text-bad">{error}</p>;
  if (!data) return <Bones />;
  const groups = [...new Set(data.flags.map((f) => f.group))];
  return (
    <>
      {groups.map((g) => (
        <Card key={g} title={g}>
          <ul className="grid gap-3">
            {data.flags
              .filter((f) => f.group === g)
              .map((f) => (
                <li key={f.name} className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-3 last:border-0">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {f.label} {!f.fromDefault ? <span className="text-xs text-soft">(overridden)</span> : null}
                    </p>
                    <p className="text-sm text-soft">{f.description}</p>
                    <p className="mt-1 text-xs text-soft">Applies to every household when live.</p>
                  </div>
                  {canWrite && (
                    <div className="flex gap-2">
                      <ConfirmButton
                        label={f.value ? "Live" : "Off"}
                        confirm={f.value ? "Tap again: off for everyone" : "Tap again: live for everyone"}
                        variant="ghost"
                        busy={busy === f.name}
                        pressed={f.value}
                        onConfirm={() => {
                          setBusy(f.name);
                          void mutate(
                            () => api("/api/admin/flags/", { method: "POST", body: JSON.stringify({ name: f.name, value: !f.value }) }),
                            flash,
                            f.value ? `${f.label} off for everyone` : `${f.label} live for everyone`,
                            { ms: 4000 },
                          ).then((ok) => {
                            setBusy(null);
                            if (ok) reload();
                          });
                        }}
                      />
                      {!f.fromDefault && (
                        <ConfirmButton
                          label="Reset"
                          confirm="Tap again: use product default"
                          variant="danger"
                          busy={busy === f.name}
                          onConfirm={() => {
                            setBusy(f.name);
                            void mutate(
                              () => api("/api/admin/flags/", { method: "POST", body: JSON.stringify({ op: "clear", name: f.name }) }),
                              flash,
                              `${f.label} back to product default`,
                              { ms: 4000 },
                            ).then((ok) => {
                              setBusy(null);
                              if (ok) reload();
                            });
                          }}
                        />
                      )}
                    </div>
                  )}
                </li>
              ))}
          </ul>
        </Card>
      ))}
    </>
  );
}

function AutomationsTab({ flash, canWrite }: { flash: Flash; canWrite: boolean }) {
  const { data, reload, error } = useFetch<{
    automations: { newPurchase: boolean; refund: boolean; report: boolean; morningDigest: boolean };
    adminCount: number;
  }>("/api/admin/automations/");
  const [busy, setBusy] = useState<string | null>(null);
  if (error) return <p className="text-bad">{error}</p>;
  if (!data) return <Bones />;
  const a = data.automations;
  return (
    <Card
      title="Email alerts"
      sub={`Goes to ${data.adminCount} staff address${data.adminCount === 1 ? "" : "es"} (admins on the server list)`}
    >
      {(
        [
          ["newPurchase", "New Household purchase"],
          ["refund", "Refund / cancel"],
          ["report", "New problem report"],
          ["morningDigest", "Morning digest"],
        ] as const
      ).map(([k, label]) => (
        <div key={k} className="flex items-center justify-between gap-3 border-b border-line/60 py-3 text-sm last:border-0">
          <span>{label}</span>
          <ConfirmButton
            label={a[k] ? "Sending" : "Paused"}
            confirm={a[k] ? "Tap again: pause emails" : "Tap again: resume emails"}
            variant="ghost"
            disabled={!canWrite}
            busy={busy === k}
            pressed={a[k]}
            onConfirm={() => {
              setBusy(k);
              void mutate(
                () => api("/api/admin/automations/", { method: "POST", body: JSON.stringify({ [k]: !a[k] }) }),
                flash,
                a[k] ? `${label} paused` : `${label} sending again`,
              ).then((ok) => {
                setBusy(null);
                if (ok) reload();
              });
            }}
          />
        </div>
      ))}
      {canWrite && (
        <button
          type="button"
          className="btn-primary mt-4 disabled:opacity-50"
          disabled={busy === "test"}
          onClick={() => {
            setBusy("test");
            void mutate(
              () => api("/api/admin/automations/", { method: "POST", body: JSON.stringify({ op: "test" }) }),
              flash,
              "Test email sent to staff",
            ).then(() => setBusy(null));
          }}
        >
          {busy === "test" ? "Sending…" : "Send test email"}
        </button>
      )}
    </Card>
  );
}

function SystemTab() {
  const { data, error } = useFetch<{
    database: { ok: boolean; ms: number };
    counts: { accounts: number; devices: number };
    failedSignInsToday: number;
    commit: string;
    vercelEnv: string;
    settings: { name: string; group: string; powers: string; state: string }[];
  }>("/api/admin/system/");
  if (error) return <p className="text-bad">{error}</p>;
  if (!data) return <Bones />;
  const groups = [...new Set(data.settings.map((s) => s.group))];
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Database" value={data.database.ok ? `${data.database.ms} ms` : "Down"} />
        <Tile label="Households" value={String(data.counts.accounts)} />
        <Tile label="Displays" value={String(data.counts.devices)} />
        <Tile label="Failed staff sign-ins" value={String(data.failedSignInsToday)} hint="24h" />
      </div>
      <Card title="This deployment" sub={`${data.vercelEnv} · ${data.commit}`}>
        <p className="text-sm text-soft">Environment and commit for the build that’s live right now.</p>
      </Card>
      {groups.map((g) => (
        <Card key={g} title={g} sub="Env keys on this deploy — missing ones break that feature">
          <Table
            headers={["Env name", "What it enables", "Status"]}
            rows={data.settings
              .filter((s) => s.group === g)
              .map((s) => [
                <span key="n" className="font-mono text-xs">
                  {s.name}
                </span>,
                s.powers,
                <span key="s" className={s.state === "set" ? "text-good" : s.state === "partly" ? "text-sun" : "text-bad"}>
                  {s.state === "set" ? "Set" : s.state === "partly" ? "Partial" : "Missing"}
                </span>,
              ])}
          />
        </Card>
      ))}
    </>
  );
}

function LogTab() {
  const [who, setWho] = useState("");
  const [what, setWhat] = useState("");
  const whoQ = useDebounced(who, 300);
  const whatQ = useDebounced(what, 300);
  const path = `/api/admin/log/?who=${encodeURIComponent(whoQ)}&what=${encodeURIComponent(whatQ)}`;
  const { data, error } = useFetch<{
    entries: { id: number; at: number; admin: string; action: string; target: string | null; detail: string | null }[];
  }>(path, [whoQ, whatQ]);
  if (error) return <p className="text-bad">{error}</p>;
  return (
    <Card
      title="Audit log"
      sub="Staff actions on households, flags, codes, and plans"
      right={
        <div className="flex flex-wrap gap-2">
          <label className="grid gap-0.5 text-xs font-semibold text-soft">
            Staff email
            <input
              className="field w-40 font-normal text-sm text-ink"
              placeholder="e.g. you@"
              value={who}
              onChange={(e) => setWho(e.target.value)}
            />
          </label>
          <label className="grid gap-0.5 text-xs font-semibold text-soft">
            Action starts with
            <input
              className="field w-40 font-normal text-sm text-ink"
              placeholder="e.g. plan. or flag."
              value={what}
              onChange={(e) => setWhat(e.target.value)}
            />
          </label>
        </div>
      }
    >
      {!data && <Bones />}
      {data && data.entries.length === 0 && (
        <p className="text-sm text-soft">{whoQ || whatQ ? "No entries match these filters." : "No audited actions yet."}</p>
      )}
      {data && data.entries.length > 0 && (
        <Table
          headers={["When", "Staff", "Action", "Target"]}
          rows={data.entries.map((e) => [when(e.at), e.admin, e.action, e.target || "—"])}
        />
      )}
    </Card>
  );
}
