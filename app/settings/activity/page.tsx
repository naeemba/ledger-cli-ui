import PageContainer from '@/components/PageContainer';
import { ActivityList } from '@/features/activity';
import {
  ACTIVITY_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  parseResult,
  parseType,
} from '@/features/activity/params';
import { auditService } from '@/lib/audit';
import { requireUser } from '@/lib/auth/require-user';

type SearchParams = { type?: string; result?: string; before?: string };

const ActivityPage = async ({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) => {
  const user = await requireUser();
  const sp = await searchParams;
  const type = parseType(sp.type);
  const result = parseResult(sp.result);
  const before = decodeCursor(sp.before);

  const rows = await auditService.listForUser(user.id, {
    limit: ACTIVITY_PAGE_SIZE + 1,
    before,
    type,
    result,
  });

  const hasMore = rows.length > ACTIVITY_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, ACTIVITY_PAGE_SIZE) : rows;
  const nextCursor =
    hasMore && page.length > 0 ? encodeCursor(page[page.length - 1]) : null;

  return (
    <PageContainer>
      <ActivityList
        rows={page}
        type={type}
        result={result}
        nextCursor={nextCursor}
      />
    </PageContainer>
  );
};

export default ActivityPage;
