import { readFile } from "node:fs/promises";
import path from "node:path";

export async function loadSamplePortfolio() {
  const filePath = path.join(process.cwd(), "src", "data", "sample-portfolio.json");
  const raw = await readFile(filePath, "utf8");

  return JSON.parse(raw);
}
