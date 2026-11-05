import sharp from "sharp";

const MAX_EDGE = Number(process.env.MEDIA_WEBP_MAX_EDGE ?? 1600);
const WEBP_QUALITY = Number(process.env.MEDIA_WEBP_QUALITY ?? 80);

export type WebpConversion = {
  bytes: Uint8Array;
  contentType: "image/webp";
  extension: ".webp";
  width: number;
  height: number;
};

/** Compress catalog photos to WebP (resize long edge, keep EXIF orientation). */
export async function toWebp(input: Uint8Array): Promise<WebpConversion> {
  const image = sharp(input, { failOn: "none" }).rotate();
  const meta = await image.metadata();
  const pipeline = image.resize({
    width: MAX_EDGE,
    height: MAX_EDGE,
    fit: "inside",
    withoutEnlargement: true,
  });

  const bytes = new Uint8Array(
    await pipeline
      .webp({
        quality: WEBP_QUALITY,
        alphaQuality: 90,
        effort: 4,
      })
      .toBuffer(),
  );

  const out = await sharp(bytes).metadata();
  return {
    bytes,
    contentType: "image/webp",
    extension: ".webp",
    width: out.width ?? meta.width ?? 0,
    height: out.height ?? meta.height ?? 0,
  };
}
