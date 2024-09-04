'use client';

import { Button } from '@material-tailwind/react';
import { useState } from 'react';
import dayjs from 'dayjs';
import { useRouter } from 'next/navigation';

type Props = {
  urlPattern: string;
  from?: string;
  to?: string;
};

const DateFilter = (props: Props) => {
  const { urlPattern, from: fromProp, to: toProp } = props;
  const [from, setFrom] = useState(
    fromProp ?? dayjs().startOf('month').format('YYYY-MM-DD')
  );
  const [to, setTo] = useState(
    toProp ?? dayjs().endOf('month').format('YYYY-MM-DD')
  );

  const router = useRouter();

  const handleSubmit = () => {
    const newUrl = urlPattern.replace('{from}', from).replace('{to}', to);
    router.push(newUrl);
  };
  return (
    <div className="flex border p-4 rounded-lg">
      <input
        type="date"
        value={from}
        onChange={(e) => setFrom(e.target.value)}
        className="mr-4 px-4 rounded"
      />
      <input
        type="date"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        className="px-4 rounded"
      />
      <Button className="ml-auto" onClick={handleSubmit}>
        Apply
      </Button>
    </div>
  );
};

export default DateFilter;
