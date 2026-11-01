import { describe, expect, it } from "vitest";

import { inspectImageFile } from "./image-validation";

describe("inspectImageFile", () => {
  it("rejects text renamed to png", async () => {
    const file = new File(["hello"], "fake.png", { type: "image/png" });
    expect(await inspectImageFile(file)).toBeNull();
  });

  it("recognizes a PNG signature independently of the filename", async () => {
    const file = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      "image.bin",
      { type: "application/octet-stream" },
    );
    expect(await inspectImageFile(file)).toEqual({
      extension: "png",
      mimeType: "image/png",
    });
  });
});
