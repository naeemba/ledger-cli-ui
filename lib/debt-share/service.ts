import 'server-only';
import {
  parseSharedNet,
  parseSharedRows,
  sharedNetArgs,
  sharedRowsArgs,
} from './ledger';
import {
  shareMetaSchema,
  type ShareMeta,
  type SharedDebtPage,
} from './payload';
import type { DebtShareRepository } from './repository';
import { safeErrorFields } from './safeError';
import { deriveMetaKey, derivePageKey, newShareId, seal, unseal } from './seal';
import type { DebtShare } from '@/db/schema';
import { LockedError } from '@/lib/crypto/sessionKeys';
import { createLogger } from '@/lib/log';
import { mapWithConcurrency } from '@/utils/mapWithConcurrency';

const log = createLogger('debt-share');
const REFRESH_CONCURRENCY = 3;

export type ShareLink = { shareId: string; key: string; updatedAt: Date };

export type DebtShareDependencies = {
  repository: DebtShareRepository;
  runLedger: (userId: string, args: string[]) => Promise<string>;
  getDek: (userId: string) => Buffer | undefined;
  now?: () => Date;
};

type OpenedShare = { share: DebtShare; meta: ShareMeta };

/**
 * Shared debt pages: one sealed, link-readable snapshot per person, rebuilt
 * from ledger while the owner is unlocked. `create` MUST run under the
 * per-user lock (withUserLock): the one-share-per-person check is
 * check-then-insert with no database guard, because the person is sealed.
 * `create` and `refresh` read the local journal, so it must be pulled first.
 */
export class DebtShareService {
  private readonly now: () => Date;

  constructor(private readonly dependencies: DebtShareDependencies) {
    this.now = dependencies.now ?? (() => new Date());
  }

  private linkOf(dek: Buffer, share: DebtShare): ShareLink {
    return {
      shareId: share.id,
      key: derivePageKey(dek, share.id).toString('base64url'),
      updatedAt: share.updatedAt,
    };
  }

  private async openAll(userId: string, dek: Buffer): Promise<OpenedShare[]> {
    const metaKey = deriveMetaKey(dek);
    const shares = await this.dependencies.repository.listByUser(userId);
    return shares.flatMap((share) => {
      try {
        const meta = shareMetaSchema.parse(
          JSON.parse(unseal(metaKey, share.id, share.sealedMeta))
        );
        return [{ share, meta }];
      } catch (err) {
        log.warn(
          { ...safeErrorFields(err), shareId: share.id },
          'unreadable debt share meta'
        );
        return [];
      }
    });
  }

  private async findOpened(
    userId: string,
    dek: Buffer,
    person: string
  ): Promise<OpenedShare | undefined> {
    return (await this.openAll(userId, dek)).find(
      ({ meta }) => meta.person === person
    );
  }

  private async buildSealedPage(
    userId: string,
    dek: Buffer,
    shareId: string,
    meta: ShareMeta
  ): Promise<string> {
    const [rowsOutput, netOutput] = await Promise.all([
      this.dependencies.runLedger(userId, sharedRowsArgs(meta.person)),
      this.dependencies.runLedger(userId, sharedNetArgs(meta.person)),
    ]);
    const page: SharedDebtPage = {
      version: 1,
      ownerName: meta.ownerName,
      person: meta.person,
      net: parseSharedNet(netOutput),
      rows: parseSharedRows(rowsOutput),
      generatedAt: this.now().toISOString(),
    };
    return seal(derivePageKey(dek, shareId), shareId, JSON.stringify(page));
  }

  async create(
    userId: string,
    person: string,
    ownerName: string
  ): Promise<ShareLink> {
    const dek = this.dependencies.getDek(userId);
    if (!dek) throw new LockedError();
    const existing = await this.findOpened(userId, dek, person);
    if (existing) return this.linkOf(dek, existing.share);

    const shareId = newShareId();
    const meta: ShareMeta = { person, ownerName };
    const updatedAt = this.now();
    const share: DebtShare = {
      id: shareId,
      userId,
      sealedMeta: seal(deriveMetaKey(dek), shareId, JSON.stringify(meta)),
      sealedPage: await this.buildSealedPage(userId, dek, shareId, meta),
      createdAt: updatedAt,
      updatedAt,
    };
    await this.dependencies.repository.create(share);
    return this.linkOf(dek, share);
  }

  revoke(userId: string, shareId: string): Promise<boolean> {
    return this.dependencies.repository.delete(userId, shareId);
  }

  async linkFor(userId: string, person: string): Promise<ShareLink | null> {
    const dek = this.dependencies.getDek(userId);
    if (!dek) return null;
    const opened = await this.findOpened(userId, dek, person);
    return opened ? this.linkOf(dek, opened.share) : null;
  }

  async sharedPeople(userId: string): Promise<Set<string>> {
    const dek = this.dependencies.getDek(userId);
    if (!dek) return new Set();
    return new Set(
      (await this.openAll(userId, dek)).map(({ meta }) => meta.person)
    );
  }

  /** Rebuild every share. A failing share keeps its previous page. */
  async refresh(userId: string): Promise<void> {
    const dek = this.dependencies.getDek(userId);
    if (!dek) return;
    try {
      const opened = await this.openAll(userId, dek);
      // Each share is two ledger runs; a few at a time keeps a save with many
      // shares from waiting on them one by one.
      await mapWithConcurrency(
        opened,
        REFRESH_CONCURRENCY,
        async ({ share, meta }) => {
          try {
            const sealedPage = await this.buildSealedPage(
              userId,
              dek,
              share.id,
              meta
            );
            await this.dependencies.repository.updatePage(
              userId,
              share.id,
              sealedPage,
              this.now()
            );
          } catch (err) {
            log.error(
              { ...safeErrorFields(err), shareId: share.id },
              'debt share rebuild failed'
            );
          }
        }
      );
    } catch (err) {
      log.error(safeErrorFields(err), 'debt share refresh failed');
    }
  }
}
