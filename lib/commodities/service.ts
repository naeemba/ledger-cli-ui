import { promises as fs } from 'fs';
import path from 'path';
import {
  parseCommodityBlocks,
  serializeCommodityBlock,
  type CommodityBlock,
  type CommodityDefinition,
} from './blocks';
import { ensureIncluded } from '@/lib/journal/include';
import {
  DEFINITIONS_NAME,
  GENERATED_PRICE_DB_NAME,
  VALID_EXTS,
} from '@/lib/journal/layout';
import { withUserLock } from '@/lib/journal/mutex';
import type { JournalRepository } from '@/lib/journal/repository';
import { verifyJournalParseable } from '@/lib/journal/verify';
import { DEFINITIONS_BANNER } from '@/lib/prices/formatter';
import { pull, push, StorageConflictError } from '@/lib/storage';

export type CommodityRow = CommodityBlock & {
  file: string;
  editable: boolean;
};

export type CommodityWriteResult =
  { ok: true } | { ok: false; message: string };

/**
 * A change to definitions.ledger expressed against the original line
 * numbers: replace lines `startLine..endLine` (inclusive) with `text`
 * (`null` deletes the span), or append `append` after the last line when
 * `startLine`/`endLine` are out of range (used for `create`).
 */
type Splice = {
  startLine: number;
  endLine: number;
  text: string | null;
  append?: string;
};

/** Applies line-span splices to `source`, bottom-up, so line numbers named
 * by earlier splices stay valid as later ones are applied. Everything
 * outside a spliced span — including content between and after blocks —
 * passes through untouched. */
const applySplices = (source: string, splices: Splice[]): string => {
  const appended = splices.find((splice) => splice.append !== undefined);
  const inPlace = splices
    .filter((splice) => splice.append === undefined)
    .sort((a, b) => b.startLine - a.startLine);

  const lines = source.split('\n');
  for (const splice of inPlace) {
    const replacement = splice.text === null ? [] : splice.text.split('\n');
    lines.splice(
      splice.startLine,
      splice.endLine - splice.startLine + 1,
      ...replacement
    );
  }

  let text = lines.join('\n');
  if (appended?.append !== undefined) {
    const base = text.trimEnd() || DEFINITIONS_BANNER;
    text = `${base}\n\n${appended.append}`;
  }
  return text.endsWith('\n') ? text : `${text}\n`;
};

/**
 * CRUD over `commodity` directive blocks in the user's `definitions.ledger`.
 * Blocks found in other journal files (legacy `price-db.ledger`, hand-made
 * includes) are listed read-only. Every mutation is verified with ledger and
 * rolled back if the resulting file set does not parse.
 */
export class CommodityDefinitionService {
  constructor(private readonly repo: JournalRepository) {}

  private definitionsPath(dir: string): string {
    return path.join(dir, DEFINITIONS_NAME);
  }

  async list(userId: string): Promise<CommodityRow[]> {
    await pull(userId).catch(() => {}); // locked journal → list what's local
    const layout = await this.repo.ensureLayout(userId);
    const rows: CommodityRow[] = [];
    const entries = await fs.readdir(layout.dir).catch(() => [] as string[]);
    for (const name of entries) {
      if (!VALID_EXTS.includes(path.extname(name))) continue;
      if (name === GENERATED_PRICE_DB_NAME) continue;
      const text = await this.repo
        .readFile(path.join(layout.dir, name))
        .catch(() => '');
      for (const block of parseCommodityBlocks(text)) {
        rows.push({
          ...block,
          file: name,
          editable: name === DEFINITIONS_NAME,
        });
      }
    }
    return rows.sort((a, b) => a.symbol.localeCompare(b.symbol));
  }

  create(
    userId: string,
    definition: CommodityDefinition
  ): Promise<CommodityWriteResult> {
    return this.mutate(userId, (blocks, current) => {
      if (blocks.some((block) => block.symbol === definition.symbol)) {
        return { error: `${definition.symbol} is already defined` };
      }
      const splices = this.defaultClearedSplices(blocks, definition);
      splices.push({
        startLine: Number.MAX_SAFE_INTEGER,
        endLine: Number.MAX_SAFE_INTEGER,
        text: null,
        append: serializeCommodityBlock(definition),
      });
      return { splices };
    });
  }

  update(
    userId: string,
    symbol: string,
    next: CommodityDefinition | { raw: string }
  ): Promise<CommodityWriteResult> {
    return this.mutate(userId, (blocks) => {
      const target = blocks.find((block) => block.symbol === symbol);
      if (!target) return { error: `${symbol} is not defined` };
      if ('raw' in next) {
        return {
          splices: [
            {
              startLine: target.startLine,
              endLine: target.endLine,
              text: next.raw,
            },
          ],
        };
      }
      const splices = this.defaultClearedSplices(
        blocks.filter((block) => block !== target),
        next
      );
      splices.push({
        startLine: target.startLine,
        endLine: target.endLine,
        text: serializeCommodityBlock(next),
      });
      return { splices };
    });
  }

  remove(userId: string, symbol: string): Promise<CommodityWriteResult> {
    return this.mutate(userId, (blocks, current) => {
      const target = blocks.find((block) => block.symbol === symbol);
      if (!target) return { error: `${symbol} is not defined` };
      // Also drop one adjacent blank separator line, preferring the one
      // after the block so a leading header/comment stays attached above.
      const lines = current.split('\n');
      let endLine = target.endLine;
      if (lines[endLine + 1]?.trim() === '') endLine += 1;
      else if (
        target.startLine > 0 &&
        lines[target.startLine - 1]?.trim() === ''
      ) {
        return {
          splices: [{ startLine: target.startLine - 1, endLine, text: null }],
        };
      }
      return {
        splices: [{ startLine: target.startLine, endLine, text: null }],
      };
    });
  }

  /** Splices that re-serialize other holders of `default` when the incoming
   * definition claims it. Opaque blocks are left untouched. */
  private defaultClearedSplices(
    blocks: CommodityBlock[],
    incoming: CommodityDefinition
  ): Splice[] {
    if (!incoming.isDefault) return [];
    return blocks
      .filter(
        (block) =>
          block.isDefault && block.symbol !== incoming.symbol && !block.opaque
      )
      .map((block) => ({
        startLine: block.startLine,
        endLine: block.endLine,
        text: serializeCommodityBlock({ ...block, isDefault: false }),
      }));
  }

  /**
   * Locked read-modify-write on definitions.ledger: parse current blocks,
   * let `change` produce a set of line-span splices against the untouched
   * source text, apply them bottom-up so earlier line numbers stay valid,
   * verify with ledger, roll back on rejection, push. Splicing (rather than
   * rebuilding the file from blocks) preserves any non-commodity content
   * that sits between or after blocks. Mirrors JournalService.addTransaction's
   * write flow.
   */
  private mutate(
    userId: string,
    change: (
      blocks: CommodityBlock[],
      current: string
    ) => { splices: Splice[] } | { error: string }
  ): Promise<CommodityWriteResult> {
    return withUserLock(userId, async (): Promise<CommodityWriteResult> => {
      try {
        await pull(userId);
      } catch {
        return { ok: false, message: 'Journal is locked or unavailable.' };
      }
      const layout = await this.repo.ensureLayout(userId);
      const definitionsPath = this.definitionsPath(layout.dir);
      const original = await this.repo
        .readFile(definitionsPath)
        .catch(() => null);
      const mainOriginal = await this.repo.readFile(layout.mainPath);

      const current = original ?? '';
      const blocks = parseCommodityBlocks(current);
      const outcome = change(blocks, current);
      if ('error' in outcome) return { ok: false, message: outcome.error };

      const nextText = applySplices(current, outcome.splices);

      await this.repo.writeFileAtomic(definitionsPath, nextText);
      await ensureIncluded(this.repo, layout.mainPath, definitionsPath);

      const priceDbPath = layout.priceDbPath ?? undefined;
      const verify = await verifyJournalParseable(layout.mainPath, priceDbPath);
      if (!verify.ok) {
        if (original === null) await fs.rm(definitionsPath, { force: true });
        else await this.repo.writeFileAtomic(definitionsPath, original);
        await this.repo.writeFileAtomic(layout.mainPath, mainOriginal);
        return {
          ok: false,
          message: `Ledger rejected the definition: ${verify.message}`,
        };
      }
      try {
        await push(userId);
      } catch (error) {
        if (original === null) await fs.rm(definitionsPath, { force: true });
        else await this.repo.writeFileAtomic(definitionsPath, original);
        await this.repo.writeFileAtomic(layout.mainPath, mainOriginal);
        return {
          ok: false,
          message:
            error instanceof StorageConflictError
              ? error.message
              : 'Failed to save journal to storage.',
        };
      }
      return { ok: true };
    });
  }
}
