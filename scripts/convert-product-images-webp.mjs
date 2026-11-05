/**
 * Standalone Hostinger converter: PNG/JPEG product images → WebP.
 * Uses sharp + mysql CLI (no Prisma adapter required).
 *
 * Run from hbuilds/current/nodejs:
 *   node convert-product-images-webp.mjs
 */
import { spawnSync } from "node:child_process";
import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const CONVERTIBLE = new Set([".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tif", ".tiff"]);
const MAX_EDGE = Number(process.env.MEDIA_WEBP_MAX_EDGE ?? 1600);
const WEBP_QUALITY = Number(process.env.MEDIA_WEBP_QUALITY ?? 80);

async function loadEnvFile(path) {
  try {
    const text = await readFile(path, "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // optional
  }
}

function localRoot() {
  const override = process.env.MEDIA_LOCAL_ROOT?.trim();
  return override || join(process.cwd(), ".data", "uploads");
}

function publicUrl(key) {
  return `/api/media/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function parseDatabaseUrl(url) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname || "localhost",
    port: parsed.port || "3306",
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, "").split("?")[0],
  };
}

function mysqlExec(sql) {
  const db = parseDatabaseUrl(process.env.DATABASE_URL);
  const result = spawnSync(
    "mysql",
    [
      "-h",
      db.host,
      "-P",
      db.port,
      "-u",
      db.user,
      `-p${db.password}`,
      db.database,
      "-N",
      "-B",
      "-e",
      sql,
    ],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "mysql failed");
  }
  return result.stdout;
}

function sqlString(value) {
  return `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

async function walkFiles(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walkFiles(full)));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

async function toWebp(input) {
  const bytes = await sharp(input, { failOn: "none" })
    .rotate()
    .resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: WEBP_QUALITY, alphaQuality: 90, effort: 4 })
    .toBuffer();
  return Buffer.from(bytes);
}

async function main() {
  // Hostinger keeps secrets at hbuilds/config/.env (current/nodejs → ../../../config)
  const envCandidates = [
    join(process.cwd(), ".env"),
    join(process.cwd(), "../../../config/.env"),
    join(process.cwd(), "../../config/.env"),
    join(process.cwd(), "../config/.env"),
    process.env.DOTENV_CONFIG_PATH,
  ].filter(Boolean);
  for (const path of envCandidates) await loadEnvFile(path);
  if (!process.env.DATABASE_URL) {
    throw new Error(
      `DATABASE_URL is required (tried: ${envCandidates.join(", ")})`,
    );
  }

  const root = localRoot();
  const productsRoot = join(root, "products");
  console.log(`Scanning ${productsRoot}`);

  const files = (await walkFiles(productsRoot)).filter((file) =>
    CONVERTIBLE.has(extname(file).toLowerCase()),
  );
  console.log(`Found ${files.length} convertible image files`);

  let converted = 0;
  let failed = 0;
  let bytesBefore = 0;
  let bytesAfter = 0;
  const keyMap = new Map();

  for (const sourcePath of files) {
    try {
      const source = await readFile(sourcePath);
      bytesBefore += source.byteLength;
      const webp = await toWebp(source);
      bytesAfter += webp.byteLength;

      const nextPath = sourcePath.replace(CONVERTIBLE_EXT_RE, ".webp");
      await mkdir(dirname(nextPath), { recursive: true });
      await writeFile(nextPath, webp);
      if (nextPath !== sourcePath) await unlink(sourcePath).catch(() => undefined);

      const oldKey = relative(root, sourcePath).split("\\").join("/");
      const newKey = relative(root, nextPath).split("\\").join("/");
      keyMap.set(oldKey, newKey);

      converted += 1;
      const pct = Math.round(
        ((source.byteLength - webp.byteLength) / source.byteLength) * 100,
      );
      console.log(
        `  ✓ ${oldKey} (${(source.byteLength / 1024).toFixed(0)}KB → ${(webp.byteLength / 1024).toFixed(0)}KB, −${pct}%)`,
      );
    } catch (error) {
      failed += 1;
      console.warn(
        `  ✗ ${sourcePath}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  console.log(`\nUpdating ProductImage rows (${keyMap.size})…`);
  let updated = 0;
  for (const [oldKey, newKey] of keyMap) {
    const sql = `UPDATE ProductImage SET objectKey=${sqlString(newKey)}, url=${sqlString(publicUrl(newKey))} WHERE objectKey=${sqlString(oldKey)};`;
    mysqlExec(sql);
    updated += 1;
  }

  // Also fix any DB rows that still point at old extensions if files were already converted
  const rows = mysqlExec(
    "SELECT id, objectKey FROM ProductImage WHERE objectKey NOT LIKE 'external/%' AND (objectKey LIKE '%.png' OR objectKey LIKE '%.jpg' OR objectKey LIKE '%.jpeg' OR objectKey LIKE '%.gif');",
  )
    .trim()
    .split("\n")
    .filter(Boolean);

  for (const row of rows) {
    const [id, objectKey] = row.split("\t");
    if (!id || !objectKey) continue;
    const nextKey = objectKey.replace(CONVERTIBLE_EXT_RE, ".webp");
    if (nextKey === objectKey) continue;
    try {
      await stat(join(root, ...nextKey.split("/")));
      mysqlExec(
        `UPDATE ProductImage SET objectKey=${sqlString(nextKey)}, url=${sqlString(publicUrl(nextKey))} WHERE id=${sqlString(id)};`,
      );
      updated += 1;
      console.log(`  DB fix ${objectKey} → ${nextKey}`);
    } catch {
      // webp missing
    }
  }

  console.log(`\nDone: ${converted} files converted, ${failed} failed, ${updated} DB updates.`);
  if (bytesBefore > 0) {
    console.log(
      `Size: ${(bytesBefore / 1024 / 1024).toFixed(1)}MB → ${(bytesAfter / 1024 / 1024).toFixed(1)}MB (−${Math.round(((bytesBefore - bytesAfter) / bytesBefore) * 100)}%)`,
    );
  }
}

const CONVERTIBLE_EXT_RE = /\.(jpe?g|png|gif|bmp|tiff?)$/i;

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
