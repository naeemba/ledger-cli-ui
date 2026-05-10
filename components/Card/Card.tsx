import { twMerge } from 'tailwind-merge';
import Link from 'next/link';

type Props = {
  title?: React.ReactNode;
  body?: React.ReactNode;
  action?: {
    title: string;
    href: string;
  };
  className?: string;
};

const Card = ({ title, body, action, className }: Props) => {
  return (
    <div
      className={twMerge(
        'mt-6 w-96 rounded-xl border border-slate-100 bg-white shadow-md',
        className
      )}
    >
      <div className="p-6">
        <h5 className="mb-2 text-xl font-semibold text-slate-900">{title}</h5>
        <div className="text-base text-gray-700">{body}</div>
      </div>
      {action && (
        <div className="px-6 pb-6 pt-0">
          <Link
            href={action.href}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold uppercase text-slate-900 hover:bg-slate-50"
          >
            {action.title}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="h-4 w-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3"
              />
            </svg>
          </Link>
        </div>
      )}
    </div>
  );
};

export default Card;
