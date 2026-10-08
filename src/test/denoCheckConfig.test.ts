import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Why this exists: Deno sees the app's package.json and then only accepts `npm:` imports that match what is
// installed in node_modules (supabase-js 2.117.x). The exact pins in the edge functions (2.57.2) can't be found
// there, so the preview type-check failed. The root deno.json tells Deno to resolve `npm:` imports from its own
// cache instead, which is also how the functions really run. It sits at the project root, outside
// supabase/functions, so it is not part of any deploy. The pins must stay exactly as they are.
describe("edge function type-check config", () => {
  it("root deno.json makes Deno ignore node_modules and not write a lock file", () => {
    const cfg = JSON.parse(readFileSync("deno.json", "utf8"));
    expect(cfg.nodeModulesDir).toBe("none");
    expect(cfg.lock).toBe(false);
  });
  it("the supabase-js 2.57.2 pin is untouched", () => {
    for (const f of ["generate-daily-insights", "import-history"]) {
      expect(readFileSync(`supabase/functions/${f}/index.ts`, "utf8")).toContain('from "npm:@supabase/supabase-js@2.57.2"');
    }
  });
});
