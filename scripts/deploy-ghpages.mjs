import { promises as fs } from "node:fs";
import path from "node:path";

const DEFAULT_KEEP = new Set([".git", ".gitignore", "README.md", "CNAME"]);

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

async function emptyDirPreserving(targetDir, keepNames = DEFAULT_KEEP) {
  const entries = await fs.readdir(targetDir, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((e) => !keepNames.has(e.name))
      .map(async (e) => {
        const full = path.join(targetDir, e.name);
        await fs.rm(full, { recursive: true, force: true });
      })
  );
}

async function copyDir(srcDir, dstDir) {
  // Node 18+ supports fs.cp
  // @ts-ignore - cp exists at runtime
  if (typeof fs.cp === "function") {
    // @ts-ignore
    await fs.cp(srcDir, dstDir, { recursive: true });
    return;
  }

  // Fallback (older Node): manual recursion
  await ensureDir(dstDir);
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const src = path.join(srcDir, entry.name);
    const dst = path.join(dstDir, entry.name);
    if (entry.isDirectory()) {
      await copyDir(src, dst);
    } else if (entry.isFile()) {
      await fs.copyFile(src, dst);
    }
  }
}

function resolveTargetDir() {
  const arg = process.argv.slice(2).find((a) => a && !a.startsWith("--"));
  const env = process.env.PAGES_DIR;
  const target = arg ?? env;
  if (!target) return null;
  return path.resolve(target);
}

async function main() {
  const targetDir = resolveTargetDir();
  if (!targetDir) {
    console.error(
      "Missing target directory. Provide it as an argument or set PAGES_DIR.\n" +
        "Example:\n" +
        "  npm run build:pages\n" +
        "  npm run deploy:pages:local -- \"C:/Users/Chris/Desktop/Files/Website/STEPSinterreg.github.io\"\n"
    );
    process.exit(2);
  }

  const distDir = path.resolve("dist");
  const indexHtml = path.join(distDir, "index.html");
  if (!(await exists(indexHtml))) {
    throw new Error(
      `Expected ${indexHtml} to exist. Run \"npm run build:pages\" first.`
    );
  }

  if (!(await exists(targetDir))) {
    throw new Error(
      `Target directory does not exist: ${targetDir}\nCreate/clone your GitHub Pages repo there first.`
    );
  }

  // Sanity check: avoid accidental copy into project itself.
  const projectRoot = path.resolve(".");
  if (targetDir === projectRoot) {
    throw new Error("Refusing to deploy into the project root directory.");
  }

  await emptyDirPreserving(targetDir);
  await copyDir(distDir, targetDir);

  console.log("Deployed static site files:");
  console.log(`  from: ${distDir}`);
  console.log(`  to:   ${targetDir}`);
  console.log("\nNext (in the Pages repo): git add -A ; git commit -m \"Deploy\" ; git push");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
