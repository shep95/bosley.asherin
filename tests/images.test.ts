import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { hiddenData, scrub } from "../scripts/scrub-images.mjs";

describe("image scrubbing", () => {
  it("removes exif and gps from a photo and keeps it a valid image", async () => {
    const photo = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#8a6a3e" } })
      .jpeg()
      .withExif({ IFD0: { Make: "SecretCam", Model: "X100", Copyright: "someone" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "51/1 30/1 0/1" } })
      .toBuffer();
    expect(await hiddenData(photo)).toContain("exif");
    const clean: Buffer = await scrub(photo, ".jpg");
    expect(await hiddenData(clean)).toEqual([]);
    expect(clean.includes(Buffer.from("SecretCam"))).toBe(false);
    const m = await sharp(clean).metadata();
    expect([m.width, m.height]).toEqual([64, 48]);
  });
});
