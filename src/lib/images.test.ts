import { describe, expect, it } from "vitest";
import { initials, isStreetView, thumbSrc } from "./images";
import { normalizeItem } from "./normalize";

const PHOTO = "https://lh3.googleusercontent.com/grass-cs/AABkmLdlSB88coQBYvAgLPfWaSFx";
const STREET = "https://streetviewpixels-pa.googleapis.com/v1/thumbnail?panoid=abc&w=86&h=86";
const LOGO = "https://lh4.googleusercontent.com/-seM8BcQsGhE/AAAAAAAAAAI/AAAAAAAAAAA/hbbx/s80-p-k-no-ns-nd/photo.jpg";

describe("thumbSrc", () => {
  it("adds a size suffix to unsized Google photo URLs", () => {
    expect(thumbSrc({ imageUrl: PHOTO }, 96)).toBe(`${PHOTO}=w96-h96-c`);
  });
  it("prefers the thumbnail and leaves already-sized URLs alone", () => {
    const sized = `${PHOTO}=w86-h114-k-no`;
    expect(thumbSrc({ thumbnailUrl: sized, imageUrl: PHOTO })).toBe(sized);
  });
  it("leaves logo-style /s80- URLs alone", () => {
    expect(thumbSrc({ imageUrl: LOGO })).toBe(LOGO);
  });
  it("never returns Street View, which 403s outside a browser session", () => {
    expect(isStreetView(STREET)).toBe(true);
    expect(thumbSrc({ imageUrl: STREET })).toBeNull();
    expect(thumbSrc({ thumbnailUrl: STREET, imageUrl: PHOTO })).toBe(`${PHOTO}=w128-h128-c`);
  });
  it("returns null with nothing to show", () => {
    expect(thumbSrc({})).toBeNull();
  });
});

describe("initials", () => {
  it("takes up to two leading letters", () => {
    expect(initials("New Era Epoxy Flooring")).toBe("NE");
    expect(initials("BDC Coatings")).toBe("BC");
    expect(initials("  ")).toBe("?");
  });
});

describe("normalizeItem images", () => {
  it("maps the image fields and the Google photo count", () => {
    const r = normalizeItem({
      title: "X",
      placeId: "p",
      imageUrl: PHOTO,
      logoUrl: LOGO,
      imagesCount: 69,
    })!.place;
    expect(r).toMatchObject({ imageUrl: PHOTO, logoUrl: LOGO, photosCount: 69, thumbnailUrl: null });
  });
  it("falls back to the first gallery thumbnail when a gallery came back", () => {
    const r = normalizeItem({ title: "X", placeId: "p", "images/0/thumbnailUrl": `${PHOTO}=w86-h114-k-no` })!.place;
    expect(r.thumbnailUrl).toBe(`${PHOTO}=w86-h114-k-no`);
  });
  it("treats empty strings as missing", () => {
    expect(normalizeItem({ title: "X", placeId: "p", logoUrl: "", imagesCount: "" })!.place).toMatchObject({
      logoUrl: null,
      photosCount: null,
    });
  });
});
