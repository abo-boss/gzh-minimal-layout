import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { loadThemeLibraries } from "../src/theme/theme-library.js";

const forbidden: Array<[RegExp, string]> = [
  [/\bposition\s*:\s*(?:absolute|fixed|sticky)\b/iu, "absolute/fixed/sticky positioning is not compatible with the WeChat fragment contract"],
  [/\bfloat\s*:/iu, "float is not compatible with the WeChat fragment contract"],
  [/\bwhite-space\s*:\s*pre\b/iu, "white-space:pre turns source indentation into visible gaps"],
  [/\bdisplay\s*:\s*grid\b/iu, "display:grid is not supported by the WeChat fragment contract"],
  [/\b(?:class|id)\s*=/iu, "class/id must not be required by component templates"],
];

async function main(): Promise<void> {
  const root = process.cwd();
  const themesRoot = path.join(root, ".themes");
  const entries = await readdir(themesRoot, { withFileTypes: true });
  const componentFiles = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
    const componentRoot = path.join(themesRoot, entry.name, "components");
    return walk(componentRoot);
  }));
  const issues: string[] = [];
  for (const file of componentFiles.flat()) {
    if (!file.endsWith(".json") && !file.endsWith(".html")) continue;
    const content = await readFile(file, "utf8");
    for (const [pattern, message] of forbidden) {
      if (pattern.test(content)) issues.push(`${path.relative(root, file)}: ${message}`);
    }
  }
  try {
    const libraries = await loadThemeLibraries(root);
    for (const library of libraries) {
      const recipeIds = library.manifest.composition.recipes.map((recipe) => recipe.id).join(", ");
      process.stdout.write(`✓ ${library.manifest.id}: ${library.components.length} components; recipes ${recipeIds}\n`);
    }
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }
  if (issues.length > 0) {
    for (const issue of issues) process.stderr.write(`✗ ${issue}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write("✓ Theme source lint passed: all packages are loadable and WeChat-safe.\n");
}

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const next = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(next) : Promise.resolve([next]);
  }));
  return nested.flat();
}

await main();
