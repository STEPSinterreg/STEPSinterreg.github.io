import { promises as fs } from "node:fs";
import path from "node:path";

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const distDir = path.resolve("dist");
  const indexHtml = path.join(distDir, "index.html");
  const notFoundHtml = path.join(distDir, "404.html");
  const noJekyll = path.join(distDir, ".nojekyll");

  if (!(await exists(indexHtml))) {
    throw new Error(
      `Expected ${indexHtml} to exist. Run \"npm run build\" first.`
    );
  }

  // GitHub Pages SPA refresh support: serve the same app shell for unknown paths.
  await fs.copyFile(indexHtml, notFoundHtml);
  await fs.writeFile(noJekyll, "");
  console.log(`Wrote ${path.relative(process.cwd(), notFoundHtml)}`);
  console.log(`Wrote ${path.relative(process.cwd(), noJekyll)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
