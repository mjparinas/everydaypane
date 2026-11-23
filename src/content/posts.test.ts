import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { POSTS } from "./posts";

describe("blog posts", () => {
  it("gives every post a template screenshot that exists on disk", () => {
    const publicDir = path.join(process.cwd(), "public");
    expect(POSTS.length).toBeGreaterThan(0);
    for (const post of POSTS) {
      expect(post.image, post.slug).toMatch(/^\/templates\/.+\.png$/);
      expect(existsSync(path.join(publicDir, post.image.slice(1))), post.image).toBe(true);
    }
  });

  it("avoids Canadian-family and UC-Display21 marketing framing", () => {
    const blob = POSTS.map((p) => `${p.title}\n${p.description}\n${JSON.stringify(p.body)}`).join("\n");
    expect(blob).not.toMatch(/Canadian family/i);
    expect(blob).not.toMatch(/UC-Display21/i);
    expect(blob).not.toMatch(/UniFi UC-Display/i);
  });
});
