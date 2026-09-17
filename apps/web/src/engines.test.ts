import { EngineTypeSchema } from "@nicebear/shared-types";
import { describe, expect, it } from "vitest";
import { getEngine, listEngines } from "./lib/engines/registry";

describe("engine registry (§6)", () => {
  it("implements every engine_type in the shared schema", () => {
    const registered = new Set(listEngines());
    for (const id of EngineTypeSchema.options) {
      expect(registered.has(id), `missing engine: ${id}`).toBe(true);
    }
  });

  it("generates deterministic, well-formed SVG for every engine", () => {
    for (const id of EngineTypeSchema.options) {
      const engine = getEngine(id)!;
      const a = engine.generate("e2e-seed");
      const b = engine.generate("e2e-seed");
      expect(a, id).toBe(b);
      expect(a.startsWith("<svg"), id).toBe(true);
      expect(a.endsWith("</svg>"), id).toBe(true);
      expect(a.length, id).toBeGreaterThan(100);
      expect(a, `${id} has unsubstituted values`).not.toMatch(/NaN|undefined/);
    }
  });

  it("mixed picks deterministically per seed", () => {
    const m = getEngine("mixed")!;
    expect(m.generate("s1")).toBe(m.generate("s1"));
    // Across many seeds, mixed exercises more than one base engine.
    const outs = new Set(Array.from({ length: 20 }, (_, i) => m.generate(`seed-${i}`)));
    expect(outs.size).toBeGreaterThan(1);
  });
});
