import path from "node:path";

const sourceTextByFile = sourceTextMap();
const sourceFiles = [...sourceTextByFile.keys()].sort();

export function walkTsFiles(dir: string, out: string[] = []): string[] {
  const safeDir = resolveWithinSource(dir);
  for (const file of sourceFiles) {
    const relative = path.relative(safeDir, file);
    if (relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)) {
      out.push(file);
    }
  }
  return out;
}

export function readTextFileWithinRepo(file: string): string {
  const safeFile = resolveWithinSource(file);
  const text = sourceTextByFile.get(safeFile);
  if (text === undefined) throw new Error(`Source file is not available to tests: ${file}`);
  return text;
}

function resolveWithinSource(fileOrDir: string): string {
  const srcRoot = path.join(process.cwd(), "src");
  const resolved = path.resolve(fileOrDir);
  const relative = path.relative(srcRoot, resolved);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return resolved;
  }
  throw new Error(`Path is outside the source tree: ${fileOrDir}`);
}

function sourceTextMap(): Map<string, string> {
  const modules = import.meta.glob("/src/**/*.ts", {
    eager: true,
    import: "default",
    query: "?raw",
  }) as Record<string, string>;

  return new Map(
    Object.entries(modules).map(([file, text]) => [path.join(process.cwd(), file.slice(1)), text]),
  );
}
