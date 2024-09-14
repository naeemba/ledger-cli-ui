'use client';

import { Button, ButtonGroup } from '@material-tailwind/react';
import Link from 'next/link';

type Props = {
  path: string;
};

const AccountButtons = (props: Props) => {
  const { path } = props;
  return (
    <ButtonGroup className="inline-flex" variant="outlined" color="black">
      <Button className="p-0">
        <Link
          className="py-3 px-6 block"
          href={`/accounts/${encodeURIComponent(path)}`}
        >
          All Transactions Report
        </Link>
      </Button>
      <Button className="p-0">
        <Link
          className="py-3 px-6 block"
          href={`/registers/monthly/${encodeURIComponent(path)}`}
        >
          Monthly Report
        </Link>
      </Button>
    </ButtonGroup>
  );
};

export default AccountButtons;
