// @vitest-environment jsdom
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const clerkRoot = vi.fn((props: { nonce?: string; dynamic?: boolean; children?: ReactNode }) => <>{props.children}</>);

vi.mock("@clerk/nextjs", () => ({
  ClerkProvider: (props: { nonce?: string; dynamic?: boolean; children?: ReactNode }) => clerkRoot(props),
}));

describe("AppClerkProvider", () => {
  beforeEach(() => {
    clerkRoot.mockClear();
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_everydaypane";
  });

  it("passes the CSP nonce and dynamic so clerk-js can load under strict-dynamic", async () => {
    const { AppClerkProvider } = await import("./ClerkProvider");
    render(
      <AppClerkProvider nonce="NmI2NDEwYzMt">
        <span>ok</span>
      </AppClerkProvider>,
    );
    expect(clerkRoot).toHaveBeenCalled();
    const props = clerkRoot.mock.calls[0]?.[0];
    expect(props?.nonce).toBe("NmI2NDEwYzMt");
    expect(props?.dynamic).toBe(true);
  });
});
