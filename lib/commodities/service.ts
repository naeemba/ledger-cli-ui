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
  PRICE_DB_NAME,
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
      if (!/\.(ledger|dat|journal|txt)$/.test(name)) continue;
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
    return this.mutate(userId, (blocks) => {
      if (blocks.some((block) => block.symbol === definition.symbol)) {
        return { error: `${definition.symbol} is already defined` };
      }
      return {
        blocks: [
          ...this.withDefaultCleared(blocks, definition),
          { text: serializeCommodityBlock(definition) },
        ],
      };
    });
  }

  update(
    userId: string,
    symbol: string,
    next: CommodityDefinition | { raw: string }
  ): Promise<CommodityWriteResult> {
    return this.mutate(userId, (blocks) => {
      const index = blocks.findIndex((block) => block.symbol === symbol);
      if (index === -1) return { error: `${symbol} is not defined` };
      if ('raw' in next) {
        const result = blocks.map((block) => ({ text: block.raw }));
        result[index] = { text: next.raw };
        return { blocks: result };
      }
      const result = this.withDefaultCleared(blocks, next);
      result[index] = { text: serializeCommodityBlock(next) };
      return { blocks: result };
    });
  }

  remove(userId: string, symbol: string): Promise<CommodityWriteResult> {
    return this.mutate(userId, (blocks) => {
      if (!blocks.some((block) => block.symbol === symbol)) {
        return { error: `${symbol} is not defined` };
      }
      return {
        blocks: blocks
          .filter((block) => block.symbol !== symbol)
          .map((block) => ({ text: block.raw })),
      };
    });
  }

  /** Re-serialize every block, clearing `default` from previous holders when
   * the incoming definition claims it. Opaque blocks stay verbatim. */
  private withDefaultCleared(
    blocks: CommodityBlock[],
    incoming: CommodityDefinition
  ): { text: string }[] {
    return blocks.map((block) => {
      if (
        incoming.isDefault &&
        block.isDefault &&
        block.symbol !== incoming.symbol &&
        !block.opaque
      ) {
        return {
          text: serializeCommodityBlock({ ...block, isDefault: false }),
        };
      }
      return { text: block.raw };
    });
  }

  /**
   * Locked read-modify-write on definitions.ledger: parse current blocks, let
   * `change` produce the next block list, rewrite the file (preserving the
   * banner/header lines above the first block), verify with ledger, roll back
   * on rejection, push. Mirrors JournalService.addTransaction's write flow.
   */
  private mutate(
    userId: string,
    change: (
      blocks: CommodityBlock[]
    ) => { blocks: { text: string }[] } | { error: string }
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
      const outcome = change(blocks);
      if ('error' in outcome) return { ok: false, message: outcome.error };

      // Header = everything above the first block (banner, user comments).
      const headerEnd = blocks.length > 0 ? blocks[0].startLine : null;
      const header =
        headerEnd !== null
          ? current.split('\n').slice(0, headerEnd).join('\n').trimEnd()
          : current.trimEnd() || DEFINITIONS_BANNER;
      const body = outcome.blocks.map((block) => block.text).join('\n\n');
      const nextText = `${header ? header + '\n\n' : ''}${body}\n`;

      await this.repo.writeFileAtomic(definitionsPath, nextText);
      await ensureIncluded(this.repo, layout.mainPath, definitionsPath);

      const generatedPath = path.join(layout.dir, GENERATED_PRICE_DB_NAME);
      const priceDbPath = await fs
        .access(generatedPath)
        .then(() => generatedPath)
        .catch(() =>
          fs
            .access(path.join(layout.dir, PRICE_DB_NAME))
            .then(() => path.join(layout.dir, PRICE_DB_NAME))
            .catch(() => undefined)
        );
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
