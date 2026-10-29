import { describe, expect, it } from "vitest";
import { classifyByRules } from "./relevance";
import { PRESETS } from "./presets";

const flooring = PRESETS.find((p) => p.key === "flooring-concrete")!.playbook;
const painting = PRESETS.find((p) => p.key === "painting")!.playbook;

describe("classifyByRules", () => {
  it("target: primary category + keyword", () => {
    const r = classifyByRules(
      { title: "New Era Epoxy Flooring Houston", categories: ["Flooring contractor", "Concrete contractor"], domain: "neweraepoxy.com" },
      flooring,
    );
    expect(r.label).toBe("target");
  });

  it("noise: big-box chain on the exclusion list", () => {
    const r = classifyByRules(
      { title: "The Home Depot", categories: ["Home improvement store"], domain: "homedepot.com" },
      flooring,
    );
    expect(r).toMatchObject({ label: "noise" });
    expect(r.reason).toMatch(/Home Depot/);
  });

  it("noise: excluded primary category", () => {
    const r = classifyByRules({ title: "Local Paint Shop", categories: ["Paint store"], domain: "x.com" }, painting);
    expect(r.label).toBe("noise");
  });

  it("gray zone: target category only as a secondary category", () => {
    const r = classifyByRules(
      { title: "Acme Remodeling", categories: ["Remodeler", "Painter"], domain: "acme.com" },
      painting,
    );
    expect(r.label).toBeNull();
  });

  it("is per niche: a paint store is noise for painters", () => {
    const place = { title: "Smith Paint Supply", categories: ["Paint store"], domain: "smithpaint.com" };
    expect(classifyByRules(place, painting).label).toBe("noise");
  });

  it("scratch niche with nothing configured never decides", () => {
    const empty = { ...flooring, includeCategories: [], includeKeywords: [], chainExclusions: [] };
    expect(classifyByRules({ title: "Anything", categories: ["Foo"] }, empty).label).toBeNull();
  });
});
