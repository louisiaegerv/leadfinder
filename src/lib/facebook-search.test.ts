import { describe, expect, it } from "vitest";
import { adLibraryUrl, facebookPage, facebookQuery, matchFacebook } from "./facebook-search";
import type { Snippet } from "./owner-search";

const snip = (url: string, title: string, description = ""): Snippet => ({ url, host: new URL(url).hostname.replace(/^www\./, ""), title, description });

describe("facebookQuery", () => {
  it("is the name, city, state and the word Facebook", () => {
    expect(facebookQuery({ title: "New Era Epoxy Flooring Houston", city: "Spring", state: "Texas" })).toBe("New Era Epoxy Flooring Houston Spring Texas Facebook");
  });

  it("copes with missing place, stray quotes, and a keyword-stuffed name", () => {
    expect(facebookQuery({ title: ' Joe\'s  "Best"\n Paint ', city: null, state: null })).toBe("Joe's Best Paint Facebook");
    const long = "Divine Shine Detail Lab ~ mobile detail ~ paint correction ~ ceramic coating ~ window tint ~paint protection film";
    expect(facebookQuery({ title: long, city: "Spring", state: "Texas" }).split(" ").length).toBeLessThanOrEqual(15);
  });
});

describe("facebookPage", () => {
  it("reduces posts, tabs and tracking to the page itself", () => {
    expect(facebookPage("https://www.facebook.com/neweraepoxy/?ref=page_internal")).toEqual({ url: "https://www.facebook.com/neweraepoxy", pageId: null });
    expect(facebookPage("https://m.facebook.com/neweraepoxy/posts/123456789")?.url).toBe("https://www.facebook.com/neweraepoxy");
    expect(facebookPage("https://www.facebook.com/neweraepoxy/reviews")?.url).toBe("https://www.facebook.com/neweraepoxy");
    expect(facebookPage("https://www.facebook.com/pg/neweraepoxy/photos")?.url).toBe("https://www.facebook.com/neweraepoxy");
  });

  it("reads the numeric page id where the url carries one", () => {
    expect(facebookPage("https://www.facebook.com/profile.php?id=100063498765432&sk=reviews")).toEqual({ url: "https://www.facebook.com/profile.php?id=100063498765432", pageId: "100063498765432" });
    expect(facebookPage("https://www.facebook.com/p/New-Era-Epoxy-Flooring-100063498765432/")).toEqual({ url: "https://www.facebook.com/p/New-Era-Epoxy-Flooring-100063498765432", pageId: "100063498765432" });
    expect(facebookPage("https://www.facebook.com/people/New-Era-Epoxy/100063498765432/")?.pageId).toBe("100063498765432");
    expect(facebookPage("https://www.facebook.com/pages/New-Era/123456789012345")?.pageId).toBe("123456789012345");
    expect(facebookPage("https://www.facebook.com/100063498765432")?.pageId).toBe("100063498765432");
  });

  it("rejects everything that is not a page", () => {
    for (const u of [
      "https://www.facebook.com/", "https://www.facebook.com/groups/epoxyfloors", "https://www.facebook.com/events/123", "https://www.facebook.com/watch/?v=1",
      "https://www.facebook.com/marketplace/item/1", "https://www.facebook.com/sharer/sharer.php?u=x", "https://www.facebook.com/photo.php?fbid=1",
      "https://www.facebook.com/profile.php?name=x", "https://l.facebook.com/l.php?u=x", "https://www.instagram.com/neweraepoxy/", "https://example.com/facebook.com/x", "not a url",
    ])
      expect(facebookPage(u), u).toBeNull();
  });

  it("builds an Ad Library link from the page id", () => {
    const u = new URL(adLibraryUrl("100063498765432"));
    expect(u.origin + u.pathname).toBe("https://www.facebook.com/ads/library/");
    expect(u.searchParams.get("view_all_page_id")).toBe("100063498765432");
    expect(u.searchParams.get("country")).toBe("US");
  });
});

describe("matchFacebook", () => {
  const place = { title: "New Era Epoxy Flooring Houston", city: "Spring", state: "Texas", phone: "+18322533211" };

  it("picks the business's page, and saves it as accepted, when name and place agree", () => {
    const r = matchFacebook(place, [
      snip("https://www.yelp.com/biz/new-era-epoxy", "New Era Epoxy - Yelp", "Epoxy flooring in Spring, TX"),
      snip("https://www.facebook.com/neweraepoxy/", "New Era Epoxy Flooring Houston | Spring TX | Facebook", "New Era Epoxy Flooring Houston, Spring, Texas. 4.9 rating. Call 832-253-3211"),
      snip("https://www.facebook.com/neweraepoxy/posts/99", "New Era Epoxy Flooring Houston - Posts", "Check out this garage in Spring"),
    ]);
    expect(r.best).toMatchObject({ url: "https://www.facebook.com/neweraepoxy", pageId: null, accepted: true, position: 2 });
    expect(r.best!.confidence).toBeGreaterThanOrEqual(0.8);
    expect(r.candidates).toHaveLength(1); // the post and the page are one page
  });

  it("keeps the page id when only a later result for the same page carried it", () => {
    const r = matchFacebook(place, [
      snip("https://www.facebook.com/p/New-Era-Epoxy-Flooring-Houston-100063498765432/", "New Era Epoxy Flooring Houston | Spring TX", "Spring, Texas"),
      snip("https://www.facebook.com/p/New-Era-Epoxy-Flooring-Houston-100063498765432/reviews", "New Era Epoxy Flooring Houston reviews", ""),
    ]);
    expect(r.best?.pageId).toBe("100063498765432");
  });

  it("matches a name written a little differently (floors vs flooring, LLC, ampersands)", () => {
    const r = matchFacebook(
      { title: "Acme Floors & Coatings LLC", city: "Conroe", state: "Texas", phone: null },
      [snip("https://www.facebook.com/AcmeFlooringCoatings", "Acme Flooring & Coatings | Conroe TX", "Conroe, Texas")],
    );
    expect(r.best).toMatchObject({ url: "https://www.facebook.com/AcmeFlooringCoatings", accepted: true });
  });

  it("does not accept a different business that shares a word or two, but lists it as a possibility", () => {
    const r = matchFacebook(place, [snip("https://www.facebook.com/EpoxyKingsDallas", "Epoxy Kings Dallas", "Garage epoxy in Dallas, Texas")]);
    expect(r.best).toBeNull();
    expect(r.candidates.every((c) => !c.accepted)).toBe(true);
  });

  it("will not accept a name match on its own when nothing else agrees and it is far down the list", () => {
    const filler = Array.from({ length: 3 }, (_, i) => snip(`https://site${i}.com/`, "Unrelated", "x"));
    const r = matchFacebook(place, [...filler, snip("https://www.facebook.com/NewEraEpoxyOhio", "New Era Epoxy | Columbus", "Ohio")]);
    expect(r.best).toBeNull(); // 2 of 5 words, no town, no phone
  });

  it("uses the phone number to confirm a page whose name is only partly matched", () => {
    const r = matchFacebook(place, [snip("https://www.facebook.com/NewEraFloors", "New Era Floors", "Call (832) 253-3211 today")]);
    expect(r.best).toMatchObject({ accepted: true });
    expect(r.best!.confidence).toBeGreaterThan(0.6);
  });

  it("returns nothing when there is no Facebook result, or no usable name", () => {
    expect(matchFacebook(place, [snip("https://www.yelp.com/biz/x", "New Era Epoxy", "")])).toEqual({ best: null, candidates: [] });
    expect(matchFacebook({ ...place, title: "LLC Inc" }, [snip("https://www.facebook.com/x", "x", "")])).toEqual({ best: null, candidates: [] });
    expect(matchFacebook(place, [])).toEqual({ best: null, candidates: [] });
  });
});
