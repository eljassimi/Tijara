import { mkdir, lstat, readlink, rm, symlink } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * Hostinger wipes hbuilds/current on every deploy. Keep product media in a
 * sibling folder (MEDIA_PERSIST_ROOT) and recreate a symlink for the path the
 * running app still uses (MEDIA_LOCAL_ROOT / .data/uploads).
 */
async function main() {
  const persist = process.env.MEDIA_PERSIST_ROOT?.trim();
  if (!persist) return;
  if (process.env.MEDIA_STORAGE_DRIVER !== "local") return;

  const link =
    process.env.MEDIA_LOCAL_ROOT?.trim() ||
    join(process.cwd(), ".data", "uploads");

  await mkdir(persist, { recursive: true });
  await mkdir(dirname(link), { recursive: true });

  try {
    const existing = await lstat(link);
    if (existing.isSymbolicLink()) {
      const target = await readlink(link);
      if (target === persist) {
        console.log(`Media link OK: ${link} → ${persist}`);
        return;
      }
      await rm(link, { force: true });
    } else {
      // Don't destroy a real uploads directory with files.
      console.warn(
        `Skip media link: ${link} exists and is not a symlink. Set MEDIA_LOCAL_ROOT to MEDIA_PERSIST_ROOT in hPanel instead.`,
      );
      return;
    }
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
      throw error;
  }

  await symlink(persist, link);
  console.log(`Linked media: ${link} → ${persist}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
