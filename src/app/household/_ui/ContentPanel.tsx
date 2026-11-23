"use client";

import { useEffect, useState } from "react";

import { Section, Text } from "./fields";
import { useAdmin } from "./store";

// Phase 5 integrations: YNAB, Fitbit, Slack, Trello and Gmail unread.

export function ContentPanel() {
  const edit = useAdmin((s) => s.edit);
  const ynab = useAdmin((s) => s.config.integrations.ynab);
  const trello = useAdmin((s) => s.config.integrations.trello);
  const [ynabTok, setYnabTok] = useState("");
  const [trelloTok, setTrelloTok] = useState("");

  useEffect(() => {
    void fetch("/api/household/content/status/")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { ynab?: boolean; trello?: boolean; fitbit?: boolean; slack?: boolean; gmail?: boolean } | null) => {
        if (!j) return;
        // Status only — tokens are never shown again.
        void j;
      });
  }, []);

  async function saveSecret(kind: "ynab" | "trello", token: string) {
    await fetch(`/api/household/content/${kind}-token/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (kind === "ynab") setYnabTok("");
    else setTrelloTok("");
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section id="settings-ynab" title="YNAB">
        <p className="text-xs text-soft">OAuth app or paste a personal access token. Budget id is optional if you only have one.</p>
        <Text
          label="Budget id"
          value={ynab.budgetId}
          maxLength={64}
          onChange={(v) => edit((c) => void (c.integrations.ynab.budgetId = v))}
        />
        <Text
          label="Budget name"
          value={ynab.budgetName}
          maxLength={80}
          onChange={(v) => edit((c) => void (c.integrations.ynab.budgetName = v))}
        />
        <Text label="Personal access token" value={ynabTok} maxLength={200} onChange={setYnabTok} />
        <button
          type="button"
          className="btn-ghost justify-self-start"
          disabled={!ynabTok.trim()}
          onClick={() => void saveSecret("ynab", ynabTok.trim())}
        >
          Save YNAB token
        </button>
      </Section>
      <Section id="settings-fitbit" title="Fitbit">
        <p className="text-xs text-soft">Steps, sleep and resting heart rate for the signed-in Fitbit user.</p>
        <a className="btn-primary justify-self-start" href="/api/fitbit/connect/">
          Connect Fitbit
        </a>
      </Section>
      <Section id="settings-gmail-unread" title="Gmail unread">
        <p className="text-xs text-soft">Adds gmail.readonly to your existing Google connection (inbox count only).</p>
        <a className="btn-primary justify-self-start" href="/api/google/connect/?gmail=1">
          Connect Gmail unread
        </a>
      </Section>
      <Section id="settings-slack" title="Slack">
        <p className="text-xs text-soft">Read-only: latest channel messages on the wall (no posting).</p>
        <a className="btn-primary justify-self-start" href="/api/slack/connect/">
          Connect Slack
        </a>
      </Section>
      <Section id="settings-trello" title="Trello">
        <p className="text-xs text-soft">API key on the server (TRELLO_API_KEY); paste a member token from trello.com/app-key.</p>
        <Text
          label="Board id"
          value={trello.boardId}
          maxLength={32}
          onChange={(v) => edit((c) => void (c.integrations.trello.boardId = v))}
        />
        <Text
          label="Board name"
          value={trello.boardName}
          maxLength={80}
          onChange={(v) => edit((c) => void (c.integrations.trello.boardName = v))}
        />
        <Text label="Member token" value={trelloTok} maxLength={120} onChange={setTrelloTok} />
        <button
          type="button"
          className="btn-ghost justify-self-start"
          disabled={!trelloTok.trim()}
          onClick={() => void saveSecret("trello", trelloTok.trim())}
        >
          Save Trello token
        </button>
      </Section>
    </div>
  );
}
