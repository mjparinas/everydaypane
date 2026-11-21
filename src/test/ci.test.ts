import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");

describe("CI workflow", () => {
  it("cancels stale pull request runs but never a run on main", () => {
    // Pull requests share a group per branch; pushes to main get one group per commit, so nothing cancels them.
    expect(workflow).toContain("group: ci-${{ github.event_name == 'pull_request' && github.ref || github.sha }}");
    expect(workflow).toContain("cancel-in-progress: true");
  });
});
