import SharedLinkControls from './SharedLinkControls';
import { toSharedLink } from './lib/toSharedLink';
import type { PersonShareLink } from '@/lib/debt-share';
import Link from 'next/link';

type Props = { links: PersonShareLink[] };

/**
 * Every live share link, settled people included. A settled person drops off
 * the debts table, so without this list their link would keep working with
 * nowhere to revoke it.
 */
const SharedLinksList = ({ links }: Props) => {
  if (links.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold tracking-tight">Shared links</h2>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {links.map((link) => (
          <li
            key={link.shareId}
            className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
          >
            <Link
              href={`/debts/${encodeURIComponent(link.person)}`}
              className="min-w-0 break-all text-fg hover:underline"
            >
              {link.person}
            </Link>
            <SharedLinkControls
              person={link.person}
              link={toSharedLink(link)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
};

export default SharedLinksList;
