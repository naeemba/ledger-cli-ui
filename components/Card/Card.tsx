'use client';

import {
  Card,
  CardBody,
  Typography,
  CardFooter,
  Button,
} from '@material-tailwind/react';
import { twMerge } from 'tailwind-merge';
import { useRouter } from 'next/navigation';

type Props = {
  title?: React.ReactNode;
  body?: React.ReactNode;
  action?: {
    title: string;
    href: string;
  };
  className?: string;
};

const CardComponent = (props: Props) => {
  const { title, body, action, className } = props;
  const router = useRouter();
  return (
    <Card className={twMerge('mt-6 w-96', className)}>
      <CardBody>
        <Typography variant="h5" color="blue-gray" className="mb-2">
          {title}
        </Typography>
        <Typography>{body}</Typography>
      </CardBody>
      {action && (
        <CardFooter className="pt-0">
          <Button
            onClick={() => router.push(action.href)}
            variant="text"
            className="flex items-center gap-2"
            size="sm"
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
          </Button>
        </CardFooter>
      )}
    </Card>
  );
};

export default CardComponent;
