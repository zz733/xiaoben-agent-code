import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { globSync } from "node:fs";
import { resolve, join } from "node:path";

const APP_SRC = resolve(import.meta.dirname, "..", "packages", "app", "src");
const OUTPUT = resolve(
  import.meta.dirname,
  "..",
  "packages",
  "app",
  "src",
  "i18n",
  "string-map.json",
);

interface ExtractedString {
  key: string;
  text: string;
  file: string;
  line: number;
}

function extractStringsFromFile(filePath: string): ExtractedString[] {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const results: ExtractedString[] = [];

  const patterns = [/"([^"]{3,})"/g, /'([^']{3,})'/g, /`([^`]{3,})`/g];

  const skipPatterns = [
    /^[a-z-]+$/,
    /^\d+$/,
    /^https?:/,
    /^import/,
    /^export/,
    /^from$/,
    /^require$/,
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*\/\//.test(line) || /^\s*\*/.test(line)) continue;
    if (/import\s/.test(line) || /from\s+['"]/.test(line)) continue;
    if (/require\(['"]/.test(line)) continue;
    if (/console\.(log|warn|error|info)/.test(line)) continue;

    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(line)) !== null) {
        const text = match[1].trim();
        if (text.length < 3) continue;
        if (skipPatterns.some((p) => p.test(text))) continue;
        if (!/[a-zA-Z]{2,}/.test(text)) continue;

        const key = generateKey(text);
        results.push({ key, text, file: filePath, line: i + 1 });
      }
    }
  }

  return results;
}

function generateKey(text: string): string {
  const cleaned = text
    .replace(/[{}()\[\]]/g, "")
    .replace(/\$\{[^}]+\}/g, "")
    .trim();

  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return `strings.${cleaned.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;

  const firstWords = words.slice(0, 5).map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, ""));
  return `strings.${firstWords.join("_")}`;
}

function main() {
  console.log("Extracting translatable strings from", APP_SRC);

  const extensions = [".tsx", ".ts"];
  const allStrings: Map<string, ExtractedString> = new Map();

  for (const ext of extensions) {
    const files = globSync(`**/*${ext}`, { cwd: APP_SRC });
    for (const file of files) {
      if (file.includes("node_modules") || file.includes(".test.") || file.includes("i18n/"))
        continue;
      const fullPath = join(APP_SRC, file);
      const strings = extractStringsFromFile(fullPath);
      for (const s of strings) {
        if (!allStrings.has(s.text)) {
          allStrings.set(s.text, s);
        }
      }
    }
  }

  const mapping: Record<string, string> = {};
  for (const [text, entry] of allStrings) {
    mapping[text] = entry.key;
  }

  writeFileSync(OUTPUT, JSON.stringify(mapping, null, 2) + "\n");
  console.log(`Extracted ${allStrings.size} strings → ${OUTPUT}`);
}

main();
