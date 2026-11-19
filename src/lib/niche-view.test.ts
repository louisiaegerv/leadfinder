import { describe, expect, it } from "vitest";
import { isLiveRun, matchesRunStatus, paginate, parseNicheView } from "./niche-view";

describe("parseNicheView", () => {
  it("defaults to the overview on page 1", () => {
    expect(parseNicheView({})).toEqual({ tab: "overview", q: undefined, areaId: undefined, status: "all", page: 1 });
  });

  it("reads valid values and ignores nonsense", () => {
    expect(parseNicheView({ tab: "runs", area: "7", status: "failed", page: "3", q: "  west " })).toEqual({
      tab: "runs", q: "west", areaId: 7, status: "failed", page: 3,
    });
    const bad = parseNicheView({ tab: "nope", area: "-2", status: "x", page: "0" });
    expect(bad).toMatchObject({ tab: "overview", areaId: undefined, status: "all", page: 1 });
    expect(parseNicheView({ page: "2.7" }).page).toBe(2);
    expect(parseNicheView({ area: "1.5" }).areaId).toBeUndefined();
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 25 }, (_, i) => i);
  it("slices a page and counts the pages", () => {
    const p = paginate(items, 2, 10);
    expect(p.rows).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    expect([p.page, p.pages, p.total]).toEqual([2, 3, 25]);
  });
  it("clamps a page past the end and handles an empty list", () => {
    expect(paginate(items, 99, 10).rows).toEqual([20, 21, 22, 23, 24]);
    expect(paginate([], 1)).toMatchObject({ rows: [], page: 1, pages: 1, total: 0 });
  });
});

describe("run helpers", () => {
  it("treats runs still in Apify, awaiting ingest or scanning as live", () => {
    expect(isLiveRun({ status: "running", scanning: false })).toBe(true);
    expect(isLiveRun({ status: "succeeded", scanning: false })).toBe(true);
    expect(isLiveRun({ status: "ingested", scanning: true })).toBe(true);
    expect(isLiveRun({ status: "ingested", scanning: false })).toBe(false);
    expect(isLiveRun({ status: "failed", scanning: false })).toBe(false);
  });
  it("groups aborted with failed", () => {
    expect(matchesRunStatus("aborted", "failed")).toBe(true);
    expect(matchesRunStatus("ingested", "failed")).toBe(false);
    expect(matchesRunStatus("failed", "all")).toBe(true);
  });
});
