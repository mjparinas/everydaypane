import "server-only";

import { z } from "zod";

import type { DashboardConfig } from "@/lib/config/schema";
import type { SlackData, SlackLine } from "@/lib/display/types";

import { cached, forget } from "./cache";
import { randomToken } from "./crypto";
import { env } from "./env";
import { getSecret, setSecret } from "./secrets";

// Slack OAuth (Phase 5): unread summary or latest channel messages (read-only).

const TTL = 60_000;
export const SLACK_STATE_COOKIE = "ep_slack_state";

export class SlackDisconnected extends Error {
  constructor() {
    super("Connect Slack under Settings");
  }
}

export const slackConfigured = () => Boolean(env.slackClientId() && env.slackClientSecret());
export const slackRedirect = (origin: string) => `${env.siteUrl() || origin}/api/slack/callback/`;

export function slackConsentUrl(state: string, redirect: string): string {
  const p = new URLSearchParams({
    client_id: env.slackClientId(),
    scope: "channels:history,groups:history,im:history,mpim:history,channels:read,users:read",
    user_scope: "",
    redirect_uri: redirect,
    state,
  });
  return `https://slack.com/oauth/v2/authorize?${p}`;
}

export const newSlackState = () => randomToken(24);

const tokenSchema = z.object({ ok: z.boolean(), access_token: z.string().optional() });

export async function connectSlack(accountId: string, code: string, redirect: string, now = Date.now()): Promise<void> {
  const body = new URLSearchParams({
    client_id: env.slackClientId(),
    client_secret: env.slackClientSecret(),
    code,
    redirect_uri: redirect,
  });
  const r = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(8000),
  });
  const t = tokenSchema.parse(await r.json());
  if (!t.ok || !t.access_token) throw new Error("Slack refused the code");
  await setSecret(accountId, "slack.token", t.access_token, now);
  await forget("slack:");
}

async function slackApi(accountId: string, method: string, params: Record<string, string> = {}): Promise<unknown> {
  const token = await getSecret(accountId, "slack.token");
  if (!token) throw new SlackDisconnected();
  const p = new URLSearchParams({ ...params, token });
  const r = await fetch(`https://slack.com/api/${method}?${p}`, { signal: AbortSignal.timeout(8000) });
  const j = (await r.json()) as { ok?: boolean };
  if (!j.ok) throw new SlackDisconnected();
  return j;
}

const historySchema = z.object({
  messages: z.array(z.object({ text: z.string().optional(), ts: z.string().optional() })).default([]),
});

function channelIds(config: DashboardConfig): string[] {
  const set = new Set<string>();
  for (const view of config.views) {
    for (const w of view.widgets) {
      if (w.type === "slack") for (const id of w.channelIds) set.add(id);
    }
  }
  if (set.size === 0) for (const c of config.integrations.slack.channels) set.add(c.id);
  return [...set].slice(0, 6);
}

export async function slackFeed(accountId: string, config: DashboardConfig, count: number): Promise<SlackData> {
  const channels = channelIds(config);
  const key = `slack:${accountId}:${channels.join(",")}:${count}`;
  const { value, fetchedAt, stale } = await cached(key, TTL, async () => {
    const lines: SlackLine[] = [];
    for (const id of channels) {
      const raw = await slackApi(accountId, "conversations.history", { channel: id, limit: String(count) });
      const msgs = historySchema.parse(raw).messages;
      for (const m of msgs) {
        if (!m.text?.trim()) continue;
        lines.push({ channelId: id, text: m.text.trim().slice(0, 200) });
        if (lines.length >= count) break;
      }
      if (lines.length >= count) break;
    }
    return { unreadMentions: 0, lines };
  });
  const v = value as { unreadMentions: number; lines: SlackLine[] };
  return { updatedAt: fetchedAt, stale, connected: true, ...v };
}
