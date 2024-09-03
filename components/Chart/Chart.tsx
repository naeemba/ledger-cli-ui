'use client';

import 'chart.js/auto';
import { ChartData } from 'chart.js/auto';
import dynamic from 'next/dynamic';

const Line = dynamic(() => import('react-chartjs-2').then((mod) => mod.Bar), {
  ssr: false,
});

type Props = {
  data: ChartData<'bar', unknown, unknown>;
};

const LineChart = ({ data }: Props) => <Line data={data} />;

export default LineChart;
