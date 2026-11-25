"use client";

import { useAuth, useSignIn, useSignUp } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const NEXT_KEY = "ep_signin_next";

/** Same-origin relative path only (open redirect guard). */
function safeNext(raw: string | null): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) return null;
  return raw;
}

export type SignInIntent = "signin" | "signup";

function rememberNext(forcedNext?: string) {
  const next = safeNext(forcedNext ?? (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("next") : null));
  if (next) sessionStorage.setItem(NEXT_KEY, next);
}

function destAfterSignIn(): string {
  return safeNext(sessionStorage.getItem(NEXT_KEY)) ?? "/household/";
}

function navigateHome(router: ReturnType<typeof useRouter>) {
  const next = destAfterSignIn();
  sessionStorage.removeItem(NEXT_KEY);
  router.replace(next);
}

/** AUTH_TEST_MODE / builds without Clerk keys — signed test cookie via `/api/auth/test-signin/`. */
function TestSignInForm({ next: forcedNext, intent = "signin" }: { next?: string; intent?: SignInIntent }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "sending" | "error"; message?: string }>({ kind: "idle" });
  const signup = intent === "signup";

  useEffect(() => {
    rememberNext(forcedNext);
  }, [forcedNext]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: "sending" });
    const r = await fetch("/api/auth/test-signin/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name: name.trim() || undefined, intent }),
    });
    const res = (await r.json().catch(() => ({}))) as { error?: string; redirect?: string };
    if (!r.ok) {
      setState({ kind: "error", message: res.error ?? "Something went wrong." });
      return;
    }
    router.replace(safeNext(res.redirect ?? null) ?? destAfterSignIn());
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="mt-6 grid gap-3">
      {signup ? (
        <label className="grid gap-1 text-sm font-medium">
          Household name
          <input
            className="field"
            type="text"
            name="name"
            autoComplete="organization"
            maxLength={80}
            placeholder="Home"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      ) : null}
      <label className="grid gap-1 text-sm font-medium">
        Email
        <input className="field" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <button className="btn-primary" disabled={state.kind === "sending"}>
        {state.kind === "sending" ? "Sending…" : signup ? "Create free household" : "Sign in"}
      </button>
      {state.kind === "error" && (
        <p className="text-sm text-bad" role="alert">
          {state.message}
        </p>
      )}
    </form>
  );
}

type Phase = "email" | "code" | "sending" | "error";

/** Clerk Core 3 / Future API: email one-time codes. */
function ClerkSignInForm({ next: forcedNext, intent = "signin" }: { next?: string; intent?: SignInIntent }) {
  const router = useRouter();
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { signIn, fetchStatus: signInFetch } = useSignIn();
  const { signUp, fetchStatus: signUpFetch } = useSignUp();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<Phase>("email");
  const [flow, setFlow] = useState<"signin" | "signup">(intent === "signup" ? "signup" : "signin");
  const [message, setMessage] = useState<string | undefined>();
  const signup = intent === "signup";
  const busy = signInFetch === "fetching" || signUpFetch === "fetching" || phase === "sending";

  useEffect(() => {
    rememberNext(forcedNext);
  }, [forcedNext]);

  useEffect(() => {
    if (!authLoaded || !isSignedIn) return;
    navigateHome(router);
  }, [authLoaded, isSignedIn, router]);

  async function finalizeSignIn() {
    if (!signIn) return;
    if (signIn.status === "complete") {
      await signIn.finalize({
        navigate: () => {
          navigateHome(router);
        },
      });
    }
  }

  async function finalizeSignUp() {
    if (!signUp) return;
    if (signUp.status === "complete") {
      await signUp.finalize({
        navigate: () => {
          navigateHome(router);
        },
      });
    }
  }

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    if (!signIn || !signUp) return;
    setPhase("sending");
    setMessage(undefined);
    const address = email.trim().toLowerCase();
    try {
      if (signup || flow === "signup") {
        const { error } = await signUp.create({
          emailAddress: address,
          unsafeMetadata: { householdName: name.trim() || "Home" },
        });
        if (error) throw new Error(error.message);
        await signUp.verifications.sendEmailCode();
        setFlow("signup");
      } else {
        const { error } = await signIn.create({ identifier: address });
        if (error) {
          // Likely no account — start signup so Start free / first visit still works.
          const created = await signUp.create({
            emailAddress: address,
            unsafeMetadata: { householdName: name.trim() || "Home" },
          });
          if (created.error) throw new Error(created.error.message);
          await signUp.verifications.sendEmailCode();
          setFlow("signup");
        } else {
          await signIn.emailCode.sendCode({ emailAddress: address });
          setFlow("signin");
        }
      }
      setPhase("code");
      setMessage("Check your email for a one-time code.");
    } catch (err) {
      setPhase("error");
      setMessage(err instanceof Error ? err.message : "Couldn't send a code. Try again.");
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!signIn || !signUp) return;
    setPhase("sending");
    setMessage(undefined);
    try {
      if (flow === "signup") {
        await signUp.verifications.verifyEmailCode({ code: code.trim() });
        await finalizeSignUp();
        if (signUp.status !== "complete") {
          setPhase("error");
          setMessage("Couldn't finish signup. Try again.");
        }
        return;
      }
      await signIn.emailCode.verifyCode({ code: code.trim() });
      await finalizeSignIn();
      if (signIn.status !== "complete") {
        setPhase("error");
        setMessage("Couldn't finish sign-in. Try again.");
      }
    } catch (err) {
      setPhase("code");
      setMessage(err instanceof Error ? err.message : "Wrong code. Try again.");
    }
  }

  if (phase === "code") {
    return (
      <form onSubmit={(e) => void verifyCode(e)} className="mt-6 grid gap-3">
        <p className="rounded-xl bg-bg p-4 text-sm" role="status">
          {message ?? "Enter the code we emailed you."}
        </p>
        <label className="grid gap-1 text-sm font-medium">
          Code
          <input
            className="field"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
        <button className="btn-primary" disabled={busy}>
          Sign in
        </button>
        <button type="button" className="text-sm font-semibold text-brand" onClick={() => setPhase("email")}>
          Use a different email
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={(e) => void sendCode(e)} className="mt-6 grid gap-3">
      {signup ? (
        <label className="grid gap-1 text-sm font-medium">
          Household name
          <input
            className="field"
            type="text"
            name="name"
            autoComplete="organization"
            maxLength={80}
            placeholder="Home"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      ) : null}
      <label className="grid gap-1 text-sm font-medium">
        Email
        <input className="field" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <button className="btn-primary" disabled={busy}>
        {busy ? "Sending…" : signup ? "Create free household" : "Email me a code"}
      </button>
      {phase === "error" && (
        <p className="text-sm text-bad" role="alert">
          {message}
        </p>
      )}
    </form>
  );
}

/**
 * Clerk email one-time code when configured; otherwise the AUTH_TEST_MODE test cookie form.
 */
export function SignInForm(props: { next?: string; intent?: SignInIntent } = {}) {
  const clerkReady = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_"));
  return clerkReady ? <ClerkSignInForm {...props} /> : <TestSignInForm {...props} />;
}

export { NEXT_KEY, safeNext };
