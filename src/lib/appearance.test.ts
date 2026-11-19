import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lf-appearance-"));
process.env.DATABASE_PATH = path.join(dir, "t.db");

describe("background settings", () => {
  let a: typeof import("./appearance");
  let db: typeof import("@/db").db;
  let s: typeof import("@/db").schema;
  const uploads = () => fs.readdirSync(path.join(dir, "backgrounds"));
  const photo = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: "#3366cc" } }).jpeg().toBuffer();

  beforeAll(async () => {
    ({ db, schema: s } = await import("@/db"));
    a = await import("./appearance");
  });

  it("starts with no image and the default blur and overlay", () => {
    expect(a.getAppearance().main).toEqual({ imageUrl: null, blur: 6, overlay: 75 });
  });

  it("keeps the two regions apart and clamps the sliders", () => {
    a.updateStyle("main", { blur: 999, overlay: -5 });
    a.updateStyle("sidebar", { overlay: 40 });
    expect(a.getAppearance()).toMatchObject({ main: { blur: 40, overlay: 0 }, sidebar: { blur: 6, overlay: 40 } });
  });

  it("selects and clears a preset", () => {
    expect(a.setPreset("sidebar", "aurora").imageUrl).toBe("/backgrounds/aurora.webp");
    expect(a.clearBackground("sidebar").imageUrl).toBeNull();
  });

  it("stores an upload as a shrunken WebP and deletes it when replaced or cleared", async () => {
    const r = await a.setBackground("main", await photo(4000, 1000));
    expect(r.imageUrl).toMatch(/^\/api\/backgrounds\/[0-9a-f-]{36}\.webp$/);
    const first = uploads();
    expect(first).toHaveLength(1);
    const meta = await sharp(fs.readFileSync(path.join(dir, "backgrounds", first[0]))).metadata();
    expect(meta).toMatchObject({ format: "webp", width: 2560, height: 640 });

    await a.setBackground("main", await photo(100, 100));
    expect(uploads()).toHaveLength(1);
    expect(uploads()[0]).not.toBe(first[0]);

    a.setPreset("main", "dunes");
    expect(uploads()).toHaveLength(0);
  });

  it("rejects bytes that are not an image and leaves the old background alone", async () => {
    a.setPreset("main", "city");
    await expect(a.setBackground("main", Buffer.from("not an image"))).rejects.toThrow();
    expect(a.getAppearance().main.imageUrl).toBe("/backgrounds/city.webp");
    expect(fs.existsSync(path.join(dir, "backgrounds")) ? uploads() : []).toHaveLength(0);
  });

  it("only resolves its own file names", () => {
    expect(a.resolveUpload("../t.db")).toBeNull();
    expect(a.resolveUpload("..%2Ft.db")).toBeNull();
    expect(a.resolveUpload("0f8fad5b-d9cb-469f-a165-70867728950e.webp")).toContain("backgrounds");
  });

  it("falls back to defaults when the stored value is garbage", () => {
    db.insert(s.settings).values({ key: "appearance", value: { main: { image: "../../etc/passwd", blur: "lots", overlay: 500 }, sidebar: 7 } }).onConflictDoUpdate({ target: s.settings.key, set: { value: { main: { image: "../../etc/passwd", blur: "lots", overlay: 500 }, sidebar: 7 } } }).run();
    expect(a.getAppearance()).toEqual({ main: { imageUrl: null, blur: 6, overlay: 100 }, sidebar: { imageUrl: null, blur: 6, overlay: 75 } });
  });
});
