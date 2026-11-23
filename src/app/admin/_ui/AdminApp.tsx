"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { ADMIN_TABS, isAdminTab, OPEN_TABS, PERIOD_TABS, type AdminTab } from "@/lib/adminTabs";

import { AdminAuthCard, AdminShell } from "./AdminChrome";
import { Bars, Bones, Card, Columns, Table, Tile } from "./charts";

type Staff = { email: string; role: string };
type View = { tab: AdminTab; open: string | null; q: string; days: number; status: string };

function readView(): View {
  const p = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  const tabRaw = p.get("tab") || "Overview";
  const tab = isAdminTab(tabRaw) ? tabRaw : "Overview";
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

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  if (r.status === 404) throw new Error("notfound");
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Request failed");
  if (r.headers.get("content-type")?.includes("text/csv")) return (await r.text()) as T;
  return (await r.json()) as T;
}

const when = (t: number) => new Date(t).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" });
const day = (t: number) => new Date(t).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });

export function AdminApp() {
  const [gate, setGate] = useState<"loading" | "signin" | "twofactor" | "ok" | "error">("loading");
  const [staff, setStaff] = useState<Staff | null>(null);
  const [view, setView] = useState<View>({ tab: "Overview", open: null, q: "", days: 30, status: "open" });
  const [badges, setBadges] = useState<Partial<Record<string, number>>>({});
  const [toast, setToast] = useState("");

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
        } else if (body.state === "twofactor") {
          setStaff({ email: body.email!, role: body.role! });
          setGate("twofactor");
        } else setGate("signin");
      })
      .catch(() => {
        if (live) setGate("error");
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (gate !== "ok") return;
    void api<{ items: unknown[]; openReports?: number }>("/api/admin/todo/")
      .then(async (todo) => {
        const reports = await api<{ reports: unknown[] }>("/api/admin/reports/?status=open").catch(() => ({ reports: [] }));
        setBadges({ "To Do": todo.items.length, Reports: reports.reports.length });
      })
      .catch(() => undefined);
  }, [gate, view.tab]);

  async function signOut() {
    await api("/api/admin/signout/", { method: "POST", body: "{}" });
    setGate("signin");
    setStaff(null);
  }

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
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
  if (gate === "signin") return <SignIn onSent={() => flash("Check your email for a link.")} />;
  if (gate === "twofactor" && staff) return <TwoFactorGate email={staff.email} onReady={() => setGate("ok")} />;

  const tools = (
    <div className="flex flex-wrap items-center gap-2">
      {(view.tab === "Households" || view.tab === "Displays") && (
        <input
          className="field max-w-[12rem]"
          placeholder="Search…"
          value={view.q}
          onChange={(e) => navigate({ ...view, q: e.target.value, open: null })}
        />
      )}
      {PERIOD_TABS.has(view.tab) && (
        <div className="flex rounded-xl border border-line bg-panel p-0.5 text-xs font-semibold">
          {[7, 30, 90, 365].map((d) => (
            <button
              key={d}
              type="button"
              className={`rounded-lg px-2.5 py-1.5 ${view.days === d ? "bg-brand text-brand-ink" : "text-soft"}`}
              onClick={() => navigate({ ...view, days: d })}
            >
              {d === 365 ? "1y" : `${d}d`}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
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
        <p className="mt-3 rounded-xl bg-good/15 px-3 py-2 text-sm font-semibold text-good" role="status">
          {toast}
        </p>
      ) : null}
      <div className="mt-4 grid gap-4">
        <TabBody view={view} navigate={navigate} staff={staff!} flash={flash} />
      </div>
    </AdminShell>
  );
}

function SignIn({ onSent }: { onSent: () => void }) {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [devLink, setDevLink] = useState("");
  const expired = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("link") === "expired";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg("");
    try {
      const body = await api<{ message?: string; devLink?: string; error?: string }>("/api/admin/login/", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      if (body.devLink) setDevLink(body.devLink);
      setMsg(body.message || "Link sent.");
      onSent();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Couldn't send");
    }
  }

  return (
    <AdminAuthCard
      title="Staff sign-in"
      sub={expired ? "That link expired or was already used. Request a new one." : "Magic link for ADMIN_EMAILS / SUPPORT_EMAILS."}
    >
      <form className="grid gap-3" onSubmit={(e) => void submit(e)}>
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">Email</span>
          <input className="field" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        </label>
        <button type="submit" className="btn-primary">
          Email me a link
        </button>
      </form>
      {msg ? <p className="mt-3 text-sm text-soft">{msg}</p> : null}
      {devLink ? (
        <p className="mt-2 break-all text-sm">
          <a className="text-brand underline" href={devLink}>
            Dev link
          </a>
        </p>
      ) : null}
    </AdminAuthCard>
  );
}

function TwoFactorGate({ email, onReady }: { email: string; onReady: () => void }) {
  const [mode, setMode] = useState<"verify" | "enrol">("verify");
  const [code, setCode] = useState("");
  const [uri, setUri] = useState("");
  const [secret, setSecret] = useState("");
  const [backup, setBackup] = useState<string[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    void api<{ twoFactor: { enabled: boolean }; mode: string }>("/api/admin/2fa/").then((b) => {
      if (!b.twoFactor.enabled && b.mode === "required") {
        setMode("enrol");
        void api<{ uri: string; secret: string }>("/api/admin/2fa/", { method: "POST", body: JSON.stringify({ action: "enrol" }) }).then(
          (r) => {
            setUri(r.uri);
            setSecret(r.secret);
          },
        );
      }
    });
  }, []);

  async function verify(e: FormEvent) {
    e.preventDefault();
    setErr("");
    if (mode === "enrol") {
      const r = await api<{ result: string; codes?: string[] }>("/api/admin/2fa/", {
        method: "POST",
        body: JSON.stringify({ action: "confirm", code }),
      });
      if (r.result !== "ok") {
        setErr(r.result === "limited" ? "Too many tries." : "Wrong code.");
        return;
      }
      setBackup(r.codes ?? null);
      return;
    }
    const r = await api<{ result: string }>("/api/admin/2fa/", { method: "POST", body: JSON.stringify({ action: "verify", code }) });
    if (r.result !== "ok") {
      setErr(r.result === "limited" ? "Too many tries." : "Wrong code.");
      return;
    }
    onReady();
  }

  if (backup) {
    return (
      <AdminAuthCard title="Save your recovery codes" sub="Each works once. Store them somewhere safe.">
        <ul className="font-mono text-sm">
          {backup.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <button type="button" className="btn-primary mt-4" onClick={onReady}>
          Continue
        </button>
      </AdminAuthCard>
    );
  }

  return (
    <AdminAuthCard title={mode === "enrol" ? "Set up authenticator" : "Two-step verification"} sub={email}>
      {mode === "enrol" && secret ? (
        <div className="mb-4 text-sm text-soft">
          <p>Add this account in your authenticator app, then enter a code.</p>
          <p className="mt-2 break-all font-mono text-xs">{secret}</p>
          {uri ? (
            <p className="mt-2">
              <a className="text-brand underline" href={uri}>
                Open otpauth link
              </a>
            </p>
          ) : null}
        </div>
      ) : null}
      <form className="grid gap-3" onSubmit={(e) => void verify(e)}>
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">Code</span>
          <input
            className="field"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
        </label>
        {err ? <p className="text-sm text-bad">{err}</p> : null}
        <button type="submit" className="btn-primary">
          Continue
        </button>
      </form>
    </AdminAuthCard>
  );
}

function TabBody({ view, navigate, staff, flash }: { view: View; navigate: (v: View) => void; staff: Staff; flash: (m: string) => void }) {
  switch (view.tab) {
    case "Overview":
      return <OverviewTab days={view.days} onJump={(tab) => navigate({ ...view, tab: tab as AdminTab, open: null })} />;
    case "To Do":
      return <TodoTab flash={flash} />;
    case "Inbox":
      return <InboxTab />;
    case "Reports":
      return <ReportsTab status={view.status} onStatus={(s) => navigate({ ...view, status: s })} flash={flash} />;
    case "Traffic":
      return <TrafficTab days={view.days} />;
    case "Acquisition":
      return <AcquisitionTab days={view.days} />;
    case "Funnel":
      return <FunnelTab days={view.days} />;
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
    let live = true;
    if (!path) {
      return;
    }
    void api<T>(path)
      .then((body) => {
        if (live) {
          setData(body);
          setError("");
        }
      })
      .catch((e) => {
        if (live) setError(e instanceof Error ? e.message : "Failed");
      });
    return () => {
      live = false;
    };
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
  return (
    <>
      {data.needsYou.length > 0 && (
        <Card title="Needs you" sub="Action before vanity metrics">
          <ul className="grid gap-2">
            {data.needsYou.map((n) => (
              <li key={n.key} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-bg px-3 py-2 text-sm">
                <div>
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
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="New households" value={String(data.signups)} delta={data.signupsDelta} />
        <Tile label="New displays" value={String(data.displays)} delta={data.displaysDelta} />
        <Tile label="Free / Household" value={`${data.free} / ${data.paid}`} />
        <Tile label="Est. gross MRR" value={`$${data.grossMrr}`} hint="USD" />
      </div>
      <Card title="Sign-ups a day">
        <Columns days={data.dailySignups} />
      </Card>
    </>
  );
}

function TodoTab({ flash }: { flash: (m: string) => void }) {
  const { data, reload, error } = useFetch<{
    items: { key: string; title: string; detail: string; kind: string }[];
    tasks: { id: string; text: string; dueAt: number | null }[];
  }>("/api/admin/todo/");
  const [text, setText] = useState("");
  if (error) return <p className="text-bad">{error}</p>;
  if (!data) return <Bones />;
  return (
    <>
      <Card title="Derived">
        <ul className="grid gap-2">
          {data.items.length === 0 && <li className="text-sm text-soft">Nothing waiting.</li>}
          {data.items.map((i) => (
            <li key={i.key} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-sm">
              <div>
                <p className="font-semibold">{i.title}</p>
                <p className="text-soft">{i.detail}</p>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  onClick={() =>
                    void api("/api/admin/todo/", {
                      method: "POST",
                      body: JSON.stringify({ op: "hide", key: i.key, until: "tomorrow" }),
                    }).then(() => reload())
                  }
                >
                  Tomorrow
                </button>
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  onClick={() =>
                    void api("/api/admin/todo/", { method: "POST", body: JSON.stringify({ op: "hide", key: i.key, dismiss: true }) }).then(
                      () => reload(),
                    )
                  }
                >
                  Dismiss
                </button>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Your tasks">
        <form
          className="mb-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void api("/api/admin/todo/", { method: "POST", body: JSON.stringify({ op: "add", text }) })
              .then(() => {
                setText("");
                flash("Task added");
                reload();
              })
              .catch(() => flash("Couldn't add"));
          }}
        >
          <input className="field flex-1" value={text} onChange={(e) => setText(e.target.value)} placeholder="New task" required />
          <button type="submit" className="btn-primary">
            Add
          </button>
        </form>
        <ul className="grid gap-2">
          {data.tasks.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
              <span>{t.text}</span>
              <button
                type="button"
                className="btn-ghost text-xs"
                onClick={() =>
                  void api("/api/admin/todo/", { method: "POST", body: JSON.stringify({ op: "done", id: t.id }) }).then(reload)
                }
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
    <Card title="Inbox" sub={data.configured ? "Resend receiving" : "Not configured"}>
      {!data.configured ? (
        <ol className="list-decimal space-y-2 pl-5 text-sm text-soft">
          {data.setup.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-soft">{data.note || `Waiting: ${data.waiting}`}</p>
      )}
    </Card>
  );
}

function ReportsTab({ status, onStatus, flash }: { status: string; onStatus: (s: string) => void; flash: (m: string) => void }) {
  const { data, reload, error } = useFetch<{
    reports: { id: string; text: string; email: string | null; status: string; createdAt: number }[];
  }>(`/api/admin/reports/?status=${status}`, [status]);
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
        {data.reports.length === 0 && <li className="text-sm text-soft">No reports.</li>}
        {data.reports.map((r) => (
          <li key={r.id} className="rounded-2xl border border-line bg-panel p-4">
            <p className="text-xs text-soft">
              {day(r.createdAt)}
              {r.email ? ` · ${r.email}` : ""}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm">{r.text}</p>
            {r.status === "open" && (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className="btn-primary text-sm"
                  onClick={() =>
                    void api("/api/admin/reports/", { method: "POST", body: JSON.stringify({ id: r.id, status: "done" }) }).then(() => {
                      flash("Marked done");
                      reload();
                    })
                  }
                >
                  Done
                </button>
                <button
                  type="button"
                  className="btn-ghost text-sm"
                  onClick={() =>
                    void api("/api/admin/reports/", { method: "POST", body: JSON.stringify({ id: r.id, status: "dismissed" }) }).then(
                      reload,
                    )
                  }
                >
                  Dismiss
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function TrafficTab({ days }: { days: number }) {
  const { data, error } = useFetch<{
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
  if (error) return <p className="text-bad">{error}</p>;
  if (!data) return <Bones />;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Tile label="Visitors" value={String(data.visitors)} delta={data.visitorsDelta} />
        <Tile label="Page views" value={String(data.views)} delta={data.viewsDelta} />
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
        <Card title="utm_source">
          <Bars items={data.sources} />
        </Card>
        <Card title="Button clicks">
          <Bars items={data.tracks} />
        </Card>
      </div>
      <Card title="Search Console & Bing" sub="Optional keys in Vercel">
        <p className="text-sm text-soft">
          Set <span className="font-mono">GOOGLE_SERVICE_ACCOUNT_KEY</span> and <span className="font-mono">BING_WEBMASTER_API_KEY</span> to
          pull organic search into this tab (same pattern as Liftsmith). Until then, use Search Console and Bing Webmaster directly.
        </p>
      </Card>
    </>
  );
}

function AcquisitionTab({ days }: { days: number }) {
  const { data, error } = useFetch<{
    signups: number;
    displays: number;
    sources: { label: string; value: number }[];
    campaigns: { label: string; value: number }[];
    countries: { label: string; value: number }[];
  }>(`/api/admin/acquisition/?days=${days}`, [days]);
  if (error) return <p className="text-bad">{error}</p>;
  if (!data) return <Bones />;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Tile label="Households created" value={String(data.signups)} />
        <Tile label="Displays created" value={String(data.displays)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Sources">
          <Bars items={data.sources} />
        </Card>
        <Card title="Campaigns">
          <Bars items={data.campaigns} />
        </Card>
        <Card title="Countries">
          <Bars items={data.countries} />
        </Card>
      </div>
    </>
  );
}

function FunnelTab({ days }: { days: number }) {
  const { data, error } = useFetch<{ steps: { label: string; n: number }[]; biggest: { from: string; to: string; drop: number } | null }>(
    `/api/admin/funnel/?days=${days}`,
    [days],
  );
  if (error) return <p className="text-bad">{error}</p>;
  if (!data) return <Bones />;
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
              <div className="mb-1 flex justify-between text-sm">
                <span className="font-semibold">{s.label}</span>
                <span className="tabular-nums text-soft">
                  {s.n} · {Math.round((s.n / first) * 100)}% of first
                  {i > 0 ? ` · ${prev ? Math.round((s.n / prev) * 100) : 0}% of previous` : ""}
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-bg">
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

function RevenueTab({ flash, canWrite }: { flash: (m: string) => void; canWrite: boolean }) {
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
              className="field flex-1"
              value={c.name}
              disabled={!canWrite}
              onChange={(e) => setDraft(costs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
            />
            <input
              className="field w-24"
              type="number"
              value={c.amount}
              disabled={!canWrite}
              onChange={(e) => setDraft(costs.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) } : x)))}
            />
            <select
              className="field w-28"
              value={c.period}
              disabled={!canWrite}
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
              onClick={() => setDraft([...costs, { id: `c${Date.now()}`, name: "", amount: 0, period: "month" }])}
            >
              Add cost
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() =>
                void api("/api/admin/revenue/", { method: "POST", body: JSON.stringify({ costs }) }).then(() => {
                  flash("Saved");
                  setDraft(null);
                  reload();
                })
              }
            >
              Save costs
            </button>
          </div>
        )}
      </Card>
    </>
  );
}

function CodesTab({ flash, canWrite }: { flash: (m: string) => void; canWrite: boolean }) {
  const { data, reload, error } = useFetch<{
    codes: { code: string; kind: string; maxUses: number; used: number; enabled: boolean; note: string | null }[];
  }>("/api/admin/codes/");
  const [note, setNote] = useState("");
  if (error) return <p className="text-bad">{error}</p>;
  if (!data) return <Bones />;
  return (
    <>
      {canWrite && (
        <Card title="Create code">
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void api<{ code: string }>("/api/admin/codes/", {
                method: "POST",
                body: JSON.stringify({ op: "create", kind: "household", maxUses: 1, note }),
              }).then((r) => {
                flash(`Created ${r.code}`);
                setNote("");
                reload();
              });
            }}
          >
            <input className="field flex-1" placeholder="Internal note" value={note} onChange={(e) => setNote(e.target.value)} />
            <button type="submit" className="btn-primary">
              Create Household code
            </button>
          </form>
        </Card>
      )}
      <Card title="Codes">
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
              <button
                key="t"
                type="button"
                className="btn-ghost text-xs"
                onClick={() =>
                  void api("/api/admin/codes/", { method: "POST", body: JSON.stringify({ code: c.code, enabled: !c.enabled }) }).then(
                    reload,
                  )
                }
              >
                {c.enabled ? "Disable" : "Enable"}
              </button>
            ) : c.enabled ? (
              "Live"
            ) : (
              "Off"
            ),
          ])}
        />
      </Card>
    </>
  );
}

function HouseholdsTab({
  q,
  open,
  onOpen,
  onClose,
  canWrite,
  flash,
}: {
  q: string;
  open: string | null;
  onOpen: (id: string) => void;
  onClose: () => void;
  canWrite: boolean;
  flash: (m: string) => void;
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
              <ul className="text-sm">
                {h.devices.map((d) => (
                  <li key={d.id}>
                    {d.name} <span className="font-mono text-xs text-soft">{d.id}</span>
                    {d.isTest ? " · test" : ""}
                    {d.lastSeenAt ? ` · seen ${day(d.lastSeenAt)}` : ""}
                  </li>
                ))}
              </ul>
            </div>
            {canWrite && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() =>
                    void api("/api/admin/households/", {
                      method: "POST",
                      body: JSON.stringify({ op: "plan", id: h.id, plan: h.plan === "paid" ? "free" : "paid" }),
                    }).then(() => {
                      flash("Plan updated");
                      detail.reload();
                      reload();
                    })
                  }
                >
                  {h.plan === "paid" ? "Move to Free" : "Grant Household"}
                </button>
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
                    <p>{n.text}</p>
                  </li>
                ))}
              </ul>
              {canWrite && (
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void api("/api/admin/households/", { method: "POST", body: JSON.stringify({ op: "note", id: h.id, text: note }) }).then(
                      () => {
                        setNote("");
                        detail.reload();
                      },
                    );
                  }}
                >
                  <input className="field flex-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Private note" />
                  <button type="submit" className="btn-primary">
                    Add
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
      <Table
        headers={["Name", "Plan", "Displays", "Members", ""]}
        rows={data.households.map((h) => [
          <div key="n">
            <p className="font-semibold">{h.name}</p>
            <p className="font-mono text-xs text-soft">{h.id}</p>
          </div>,
          `${h.plan === "paid" ? "Household" : "Free"}${h.hasStripe ? " · Stripe" : ""}`,
          String(h.deviceCount),
          h.members.map((m) => m.email).join(", ") || "—",
          <button key="o" type="button" className="btn-ghost text-sm" onClick={() => onOpen(h.id)}>
            Open
          </button>,
        ])}
      />
    </Card>
  );
}

function DisplaysTab({
  q,
  open,
  onOpen,
  onClose,
  canWrite,
  flash,
}: {
  q: string;
  open: string | null;
  onOpen: (id: string) => void;
  onClose: () => void;
  canWrite: boolean;
  flash: (m: string) => void;
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
            {canWrite && (
              <button
                type="button"
                className="btn-primary w-fit"
                onClick={() =>
                  void api("/api/admin/devices/", { method: "POST", body: JSON.stringify({ id: d.id, isTest: !d.isTest }) }).then(() => {
                    flash(d.isTest ? "Unmarked test" : "Marked test");
                    detail.reload();
                    reload();
                  })
                }
              >
                {d.isTest ? "Unmark test" : "Mark as test"}
              </button>
            )}
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
          d.accountName,
          d.lastSeenAt ? day(d.lastSeenAt) : "—",
          <button key="o" type="button" className="btn-ghost text-sm" onClick={() => onOpen(d.id)}>
            Open
          </button>,
        ])}
      />
    </Card>
  );
}

function FlagsTab({ flash, canWrite }: { flash: (m: string) => void; canWrite: boolean }) {
  const { data, reload, error } = useFetch<{
    flags: { name: string; label: string; description: string; value: boolean; share: number; fromDefault: boolean; group: string }[];
  }>("/api/admin/flags/");
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
                  <div>
                    <p className="font-semibold">
                      {f.label} {!f.fromDefault ? <span className="text-xs text-soft">(changed)</span> : null}
                    </p>
                    <p className="text-sm text-soft">{f.description}</p>
                  </div>
                  {canWrite && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="btn-ghost text-sm"
                        onClick={() =>
                          void api("/api/admin/flags/", { method: "POST", body: JSON.stringify({ name: f.name, value: !f.value }) }).then(
                            () => {
                              flash("Saved");
                              reload();
                            },
                          )
                        }
                      >
                        {f.value ? "On" : "Off"}
                      </button>
                      {!f.fromDefault && (
                        <button
                          type="button"
                          className="btn-ghost text-sm"
                          onClick={() =>
                            void api("/api/admin/flags/", { method: "POST", body: JSON.stringify({ op: "clear", name: f.name }) }).then(
                              reload,
                            )
                          }
                        >
                          Default
                        </button>
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

function AutomationsTab({ flash, canWrite }: { flash: (m: string) => void; canWrite: boolean }) {
  const { data, reload, error } = useFetch<{
    automations: { newPurchase: boolean; refund: boolean; report: boolean; morningDigest: boolean };
    adminCount: number;
  }>("/api/admin/automations/");
  if (error) return <p className="text-bad">{error}</p>;
  if (!data) return <Bones />;
  const a = data.automations;
  function toggle(key: keyof typeof a) {
    void api("/api/admin/automations/", { method: "POST", body: JSON.stringify({ [key]: !a[key] }) }).then(() => {
      flash("Saved");
      reload();
    });
  }
  return (
    <Card title="Email alerts" sub={`Sent to ${data.adminCount} address${data.adminCount === 1 ? "" : "es"} on ADMIN_EMAILS`}>
      {(
        [
          ["newPurchase", "New Household purchase"],
          ["refund", "Refund / cancel"],
          ["report", "New problem report"],
          ["morningDigest", "Morning digest"],
        ] as const
      ).map(([k, label]) => (
        <label key={k} className="flex items-center justify-between gap-3 border-b border-line/60 py-3 text-sm last:border-0">
          <span>{label}</span>
          <button type="button" className="btn-ghost" disabled={!canWrite} onClick={() => toggle(k)} aria-pressed={a[k]}>
            {a[k] ? "On" : "Off"}
          </button>
        </label>
      ))}
      {canWrite && (
        <button
          type="button"
          className="btn-primary mt-4"
          onClick={() =>
            void api("/api/admin/automations/", { method: "POST", body: JSON.stringify({ op: "test" }) }).then(() => flash("Test sent"))
          }
        >
          Send test email
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
      <Card title="Deployment" sub={`${data.vercelEnv} · ${data.commit}`}>
        <p className="text-sm text-soft">Build stamp and environment for this deployment.</p>
      </Card>
      {groups.map((g) => (
        <Card key={g} title={g}>
          <Table
            headers={["Variable", "Powers", "State"]}
            rows={data.settings
              .filter((s) => s.group === g)
              .map((s) => [
                <span key="n" className="font-mono text-xs">
                  {s.name}
                </span>,
                s.powers,
                <span key="s" className={s.state === "set" ? "text-good" : s.state === "partly" ? "text-sun" : "text-bad"}>
                  {s.state}
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
  const path = `/api/admin/log/?who=${encodeURIComponent(who)}&what=${encodeURIComponent(what)}`;
  const { data, error } = useFetch<{
    entries: { id: number; at: number; admin: string; action: string; target: string | null; detail: string | null }[];
  }>(path, [who, what]);
  if (error) return <p className="text-bad">{error}</p>;
  return (
    <Card
      title="Audit log"
      right={
        <div className="flex gap-2">
          <input className="field w-36" placeholder="Who" value={who} onChange={(e) => setWho(e.target.value)} />
          <input className="field w-36" placeholder="Action prefix" value={what} onChange={(e) => setWhat(e.target.value)} />
        </div>
      }
    >
      {!data && <Bones />}
      {data && (
        <Table
          headers={["When", "Who", "Action", "Target"]}
          rows={data.entries.map((e) => [when(e.at), e.admin, e.action, e.target || "—"])}
        />
      )}
    </Card>
  );
}

// silence unused ADMIN_TABS lint in case tree-shaking
void ADMIN_TABS;
