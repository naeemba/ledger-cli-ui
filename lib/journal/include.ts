import path from 'path';

type FileAccess = {
  readFile(absolutePath: string): Promise<string>;
  writeFileAtomic(absolutePath: string, content: string): Promise<void>;
};

/** Prepend `include <relpath>` to the main journal unless already present, so
 * declarations in the included file resolve before any posting that uses them. */
export const ensureIncluded = async (
  repo: FileAccess,
  mainPath: string,
  includedPath: string
): Promise<void> => {
  const main = await repo.readFile(mainPath).catch(() => '');
  let rel = path
    .relative(path.dirname(mainPath), includedPath)
    .split(path.sep)
    .join('/');
  if (!rel.startsWith('.')) rel = `./${rel}`;
  const directive = `include ${rel}`;
  const mainDir = path.dirname(mainPath);
  const alreadyIncluded = main.split('\n').some((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('include ')) return false;
    const target = trimmed.slice('include '.length).trim();
    if (!target) return false;
    return path.resolve(mainDir, target) === path.resolve(includedPath);
  });
  if (alreadyIncluded) return;
  await repo.writeFileAtomic(mainPath, `${directive}\n${main}`);
};
