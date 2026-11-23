"use client";

import { useState, type FormEvent } from "react";

/** Settings › Report a problem — lands in platform admin Reports. */
export function ReportProblem() {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/household/report/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error || "Couldn't send");
      setText("");
      setMsg("Sent — thanks. We'll take a look.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Couldn't send");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card grid gap-3">
      <h2 className="text-lg font-semibold">Report a problem</h2>
      <p className="text-sm text-soft">Tell us what went wrong on the wall or in this panel. Staff see it in platform admin.</p>
      <form className="grid gap-2" onSubmit={(e) => void submit(e)}>
        <textarea className="field min-h-24" value={text} onChange={(e) => setText(e.target.value)} required maxLength={8000} />
        <button type="submit" className="btn-primary w-fit" disabled={busy}>
          {busy ? "Sending…" : "Send"}
        </button>
      </form>
      {msg ? <p className="text-sm text-soft">{msg}</p> : null}
    </section>
  );
}
