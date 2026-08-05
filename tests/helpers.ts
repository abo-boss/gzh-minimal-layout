import { readFile } from "node:fs/promises";
import path from "node:path";

export async function readJson(relativePath: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(process.cwd(), relativePath), "utf8")) as unknown;
}
