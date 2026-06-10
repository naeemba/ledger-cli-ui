import {
  Card as ShadcnCard,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import SavedViewRowActions from '@/features/savedViews/SavedViewRowActions';
import { routeLabel } from '@/features/savedViews/routeLabel';
import Link from 'next/link';

type ViewRow = {
  id: string;
  name: string;
  targetPath: string;
};

type Props = {
  views: ViewRow[];
};

const SavedViewsCard = ({ views }: Props) => {
  return (
    <section className="flex flex-col gap-4">
      <ShadcnCard>
        <CardHeader>
          <CardTitle className="text-lg font-semibold tracking-tight">
            Saved views
          </CardTitle>
        </CardHeader>
        <CardContent>
          {views.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No saved views yet. Look for the bookmark icon next to filters on
              Transactions, Balance, or Payees.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {views.map((view) => (
                <li
                  key={view.id}
                  className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                >
                  <Link
                    href={view.targetPath}
                    className="flex flex-col gap-0.5 flex-1 min-w-0"
                  >
                    <span className="text-sm font-medium truncate">
                      {view.name}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      {routeLabel(view.targetPath)}
                    </span>
                  </Link>
                  <SavedViewRowActions
                    viewId={view.id}
                    currentName={view.name}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </ShadcnCard>
    </section>
  );
};

export default SavedViewsCard;
