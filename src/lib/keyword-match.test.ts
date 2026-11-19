import { describe, expect, it } from "vitest";
import { contextAround, hasKeyword } from "./keyword-match";

describe("hasKeyword", () => {
  it("matches a keyword where a word starts, including its longer forms", () => {
    expect(hasKeyword("we do floor coatings", "floor coating")).toBe(true);
    expect(hasKeyword("epoxy-coated floors", "epoxy")).toBe(true);
    expect(hasKeyword("epoxy", "epoxy")).toBe(true);
  });

  it("does not match inside a word", () => {
    expect(hasKeyword("textile mills", "tile")).toBe(false);
    expect(hasKeyword("unpolished charm", "polish")).toBe(false);
  });

  it("treats punctuation in a keyword literally", () => {
    expect(hasKeyword("call (713) 555", "(713)")).toBe(true);
    expect(hasKeyword("a.b", "a.b")).toBe(true);
    expect(hasKeyword("axb", "a.b")).toBe(false);
  });
});

describe("contextAround", () => {
  it("shows a few words either side of the keyword, cut at word edges", () => {
    expect(contextAround("We install epoxy floors across Texas", "epoxy", 10)).toBe("…install epoxy floors…");
  });

  it("keeps the page's own capitalisation and adds no dots when nothing was cut", () => {
    expect(contextAround("Polished Concrete Floors", "polished concrete")).toBe("Polished Concrete Floors");
  });

  it("is null when the keyword is not there or only inside another word", () => {
    expect(contextAround("We lay carpet", "epoxy")).toBeNull();
    expect(contextAround("textile mills", "tile")).toBeNull();
  });

  it("finds the first place the keyword starts a word", () => {
    expect(contextAround("untile and then tile floors", "tile", 100)).toBe("untile and then tile floors");
    expect(contextAround("a tile b tile c", "tile", 3)).toBe("a tile b…");
  });
});
