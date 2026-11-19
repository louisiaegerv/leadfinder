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

describe("keywords found on the business's own website", () => {
  const coating = { ...flooring, includeKeywords: ["epoxy", "polyaspartic", "polish"] };
  const installer = { title: "Gonzalez Floors", categories: ["Remodeler", "Flooring contractor"], domain: "gonzalezfloors.com" };

  it("settles a business the rules could not, when its site names the work", () => {
    expect(classifyByRules(installer, coating).label).toBeNull(); // secondary category only
    const r = classifyByRules({ ...installer, siteText: "Gonzalez Floors | Garage floors: epoxy and polyaspartic coatings" }, coating);
    expect(r.label).toBe("target");
    expect(r.reason).toBe('target category listed + keyword "epoxy" on their website + keyword "polyaspartic" on their website');
  });

  it("prefers a keyword in the name or domain, and says where it was found", () => {
    const r = classifyByRules({ ...installer, title: "Gonzalez Epoxy", siteText: "epoxy" }, coating);
    expect(r.reason).toContain('"epoxy" in name/domain');
  });

  it("turns a no-evidence noise call into undecided, so the model can look at it", () => {
    const stranger = { title: "Gonzalez & Sons", categories: ["Contractor"], domain: "gonzalezsons.com" };
    expect(classifyByRules(stranger, coating).label).toBe("noise");
    const r = classifyByRules({ ...stranger, siteText: "We apply polyaspartic floor coatings" }, coating);
    expect(r.label).toBeNull();
    expect(r.reason).toBe('Keyword "polyaspartic" on their website only');
  });

  it("matches the start of a word, not the middle of one", () => {
    const stranger = { title: "Gonzalez & Sons", categories: ["Contractor"], domain: "gonzalezsons.com" };
    expect(classifyByRules({ ...stranger, siteText: "unpolished charm" }, coating).label).toBe("noise");
    expect(classifyByRules({ ...stranger, siteText: "Polished concrete floors" }, coating).label).toBeNull();
    expect(classifyByRules({ ...stranger, siteText: "Epoxy-coated floors" }, coating).label).toBeNull();
  });

  it("changes nothing when the site has not been scanned", () => {
    expect(classifyByRules({ ...installer, siteText: null }, coating)).toEqual(classifyByRules(installer, coating));
  });
});

describe("broad categories", () => {
  const pb = { ...flooring, includeCategories: ["Concrete contractor"], broadCategories: ["Flooring contractor"], includeKeywords: ["epoxy", "polyaspartic"] };
  const installer = { title: "Gonzalez Floors", categories: ["Flooring contractor"], domain: "gonzalezfloors.com" };

  it("leave a business undecided when only the broad category fits", () => {
    const r = classifyByRules(installer, pb);
    expect(r.label).toBeNull();
    expect(r.reason).toBe('Broad category "Flooring contractor" with no keyword');
  });

  it("make it a target once a keyword backs them up, from the name or the website", () => {
    expect(classifyByRules({ ...installer, title: "Gonzalez Epoxy Floors" }, pb).label).toBe("target");
    expect(classifyByRules({ ...installer, siteText: "polyaspartic garage coatings" }, pb).label).toBe("target");
  });

  it("do not weaken a category that is also listed as a full include", () => {
    const both = { ...pb, includeCategories: ["Concrete contractor", "Flooring contractor"] };
    expect(classifyByRules(installer, both).label).toBe("target");
  });

  it("are counted as include categories, so they keep a business out of noise", () => {
    expect(classifyByRules({ title: "X", categories: ["Flooring contractor"], domain: "x.com" }, { ...pb, includeKeywords: [] }).label).toBeNull();
    expect(classifyByRules({ title: "X", categories: ["Flooring contractor"], domain: "x.com" }, flooring).label).toBe("target"); // listed as a full include there
  });

  it("change nothing for a niche that lists none", () => {
    expect(classifyByRules({ ...installer, title: "Gonzalez Epoxy" }, { ...pb, broadCategories: [], includeCategories: ["Flooring contractor"] }).label).toBe("target");
  });
});

describe("each different keyword is a point", () => {
  const pb = { ...flooring, includeCategories: ["Concrete contractor"], broadCategories: [], includeKeywords: ["epoxy", "polyaspartic", "garage floor coating"] };
  const stranger = { title: "Gonzalez & Sons", categories: ["Contractor"], domain: "gonzalezsons.com" };

  it("two different keywords make a target with no matching category", () => {
    const r = classifyByRules({ ...stranger, siteText: "We install epoxy and polyaspartic floors" }, pb);
    expect(r.label).toBe("target");
    expect(r.reason).toBe('keyword "epoxy" on their website + keyword "polyaspartic" on their website');
  });

  it("works across the name and the website, and says where each was found", () => {
    const r = classifyByRules({ ...stranger, title: "Gonzalez Epoxy", siteText: "polyaspartic coatings" }, pb);
    expect(r.label).toBe("target");
    expect(r.reason).toBe('keyword "epoxy" in name/domain + keyword "polyaspartic" on their website');
  });

  it("one keyword is still only a point, however often or wherever it appears", () => {
    const r = classifyByRules({ ...stranger, title: "Gonzalez Epoxy", domain: "gonzalezepoxy.com", siteText: "epoxy epoxy epoxy" }, pb);
    expect(r.label).toBeNull();
    expect(r.reason).toBe('Keyword "epoxy" only');
  });

  it("counts a keyword that sits inside a longer matched one once", () => {
    const overlapping = { ...pb, includeKeywords: ["epoxy", "epoxy floor", "polish"] };
    expect(classifyByRules({ ...stranger, siteText: "Epoxy floor installers" }, overlapping).label).toBeNull(); // "epoxy" + "epoxy floor" is one finding
    expect(classifyByRules({ ...stranger, siteText: "Epoxy floor installers, polished concrete" }, overlapping).label).toBe("target");
  });

  it("counts a keyword listed twice once", () => {
    const dup = { ...pb, includeKeywords: ["epoxy", "Epoxy", " epoxy "] };
    expect(classifyByRules({ ...stranger, siteText: "epoxy floors" }, dup).label).toBeNull();
  });

  it("adds to a category: a secondary category plus two keywords is still a target, one keyword and a broad category too", () => {
    const withCat = classifyByRules({ title: "X", categories: ["Remodeler", "Concrete contractor"], domain: "x.com", siteText: "epoxy" }, pb);
    expect(withCat.label).toBe("target");
  });

  it("an excluded primary category is always noise, however many keywords match", () => {
    const excluded = { ...pb, excludeCategories: ["Paint store"] };
    const store = { title: "Gonzalez Coatings", categories: ["Paint store"], domain: "gonzalezcoatings.com" };
    expect(classifyByRules({ ...store, siteText: "epoxy" }, excluded).label).toBe("noise");
    const r = classifyByRules({ ...store, siteText: "epoxy and polyaspartic floors" }, excluded);
    expect(r).toEqual({ label: "noise", reason: 'Primary category "Paint store" is excluded' });
  });

  it("copes with a business that has no categories at all", () => {
    const bare = { title: "Gonzalez & Sons", categories: [], domain: "gonzalezsons.com" };
    expect(classifyByRules(bare, pb).label).toBeNull();
    expect(classifyByRules({ ...bare, siteText: "epoxy" }, pb).label).toBeNull();
    expect(classifyByRules({ ...bare, siteText: "epoxy and polyaspartic" }, pb).label).toBe("target");
  });

  it("is not thrown off by a wrong category that is not excluded", () => {
    const wrong = { title: "Gonzalez & Sons", categories: ["Restaurant"], domain: "gonzalezsons.com" };
    expect(classifyByRules(wrong, pb).label).toBe("noise");
    expect(classifyByRules({ ...wrong, siteText: "epoxy" }, pb).label).toBeNull();
    expect(classifyByRules({ ...wrong, siteText: "epoxy and polyaspartic" }, pb).label).toBe("target");
  });
});

describe("keywords found anywhere in the page text", () => {
  const pb = { ...flooring, includeCategories: ["Concrete contractor"], broadCategories: ["Flooring contractor"], includeKeywords: ["epoxy", "polyaspartic", "polished concrete"] };
  const installer = { title: "Fazio Floors", categories: ["Flooring contractor"], domain: "faziofloors.com" };
  const stranger = { title: "Gonzalez & Sons", categories: ["Contractor"], domain: "gonzalezsons.com" };
  const page = "Certified installation firm (international polished concrete institute). Also mapei epoxy moisture barrier systems for slabs.";

  it("count when two different keywords are found, and show what was around each", () => {
    const r = classifyByRules({ ...installer, pageText: page }, pb);
    expect(r.label).toBe("target");
    expect(r.reason).toContain('keyword "epoxy" in their page text ("');
    expect(r.reason).toContain("epoxy moisture barrier");
    expect(r.reason).toContain('keyword "polished concrete" in their page text ("');
    expect(classifyByRules({ ...stranger, pageText: page }, pb).label).toBe("target"); // no category needed
  });

  it("do not count a lone keyword, so one passing mention changes nothing", () => {
    const loneMention = "Mostly carpet and tile, with the occasional epoxy job.";
    const r = classifyByRules({ ...installer, pageText: loneMention }, pb);
    expect(r).toEqual(classifyByRules(installer, pb));
    expect(r.reason).toBe('Broad category "Flooring contractor" with no keyword');
    expect(classifyByRules({ ...stranger, pageText: loneMention }, pb).label).toBe("noise");
  });

  it("let the name, domain and the site's own summary of itself still count alone", () => {
    expect(classifyByRules({ ...installer, title: "Fazio Epoxy Floors", pageText: "just carpet here" }, pb).label).toBe("target");
    const summary = classifyByRules({ ...installer, siteText: "polyaspartic floors", pageText: "polyaspartic floors" }, pb);
    expect(summary.label).toBe("target");
    expect(summary.reason).toContain('keyword "polyaspartic" on their website');
  });

  it("add to a keyword found elsewhere", () => {
    const r = classifyByRules({ ...stranger, title: "Gonzalez Epoxy", pageText: "polished concrete and polyaspartic" }, pb);
    expect(r.label).toBe("target");
    expect(r.reason).toContain('keyword "epoxy" in name/domain');
  });

  it("match only at the start of a word, like the rest", () => {
    expect(classifyByRules({ ...stranger, pageText: "unpolished concrete and epoxies" }, pb).label).toBe("noise"); // only "epoxy" (as epoxies) starts a word
  });

  it("change nothing when no page text was saved", () => {
    expect(classifyByRules({ ...installer, pageText: null }, pb)).toEqual(classifyByRules(installer, pb));
  });
});

describe("a business with nothing to check", () => {
  const pb = { ...flooring, includeCategories: ["Concrete contractor"], broadCategories: [], includeKeywords: ["epoxy", "polyaspartic"] };
  const vague = { title: "Gonzalez & Sons", categories: ["General contractor"], domain: null as string | null };

  it("stays undecided when it has no website, instead of being called noise", () => {
    const r = classifyByRules({ ...vague, website: null }, pb);
    expect(r).toEqual({ label: null, reason: "No matching category or keyword, and no website to check" });
  });

  it("stays undecided when its only site is a social page", () => {
    expect(classifyByRules({ ...vague, domain: "facebook.com", website: "https://www.facebook.com/gonzalez" }, pb).label).toBeNull();
  });

  it("is still noise when it has a real website that does not match", () => {
    expect(classifyByRules({ ...vague, domain: "gonzalezsons.com", website: "https://gonzalezsons.com/", siteText: "Roofing and gutters" }, pb).label).toBe("noise");
    expect(classifyByRules({ ...vague, domain: "gonzalezsons.com", website: "https://gonzalezsons.com/" }, pb).label).toBe("noise"); // not scanned yet
  });

  it("still counts a keyword in the name, and an excluded category is still noise", () => {
    expect(classifyByRules({ ...vague, title: "Gonzalez Epoxy", website: null }, pb).reason).toBe('Keyword "epoxy" only');
    expect(classifyByRules({ ...vague, categories: ["Paint store"], website: null }, { ...pb, excludeCategories: ["Paint store"] }).label).toBe("noise");
  });

  it("is unchanged for callers that do not say whether there is a website", () => {
    expect(classifyByRules(vague, pb).label).toBe("noise");
  });
});

describe("a website that could not be read", () => {
  const pb = { ...flooring, includeCategories: ["Concrete contractor"], broadCategories: [], includeKeywords: ["epoxy", "polyaspartic"] };
  const site = { title: "Gonzalez & Sons", categories: ["General contractor"], domain: "gonzalezsons.com", website: "https://gonzalezsons.com/" };

  it("stays undecided, not noise, when the scan was blocked or broken and nothing else has read the site", () => {
    expect(classifyByRules({ ...site, siteUnread: true }, pb)).toEqual({ label: null, reason: "No matching category or keyword, and its website could not be read" });
  });

  it("is noise once the site has been read and still does not match", () => {
    expect(classifyByRules({ ...site, siteUnread: false, siteText: "Roofing and gutters" }, pb).label).toBe("noise");
  });

  it("still counts a keyword it did find, and still drops an excluded category", () => {
    expect(classifyByRules({ ...site, siteUnread: true, title: "Gonzalez Epoxy" }, pb).reason).toBe('Keyword "epoxy" only');
    expect(classifyByRules({ ...site, siteUnread: true, categories: ["Paint store"] }, { ...pb, excludeCategories: ["Paint store"] }).label).toBe("noise");
  });
});

