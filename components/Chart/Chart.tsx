'use client';

import 'chart.js/auto';
import { Chart as ChartJS, ChartData } from 'chart.js/auto';
import dynamic from 'next/dynamic';

if (typeof window !== 'undefined') {
  const readVar = (name: string) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  const muted = readVar('--muted');
  const border = readVar('--border');

  if (muted) ChartJS.defaults.color = muted;
  if (border) ChartJS.defaults.borderColor = border;
  ChartJS.defaults.font.family = 'Inter, system-ui, sans-serif';
}

const Bar = dynamic(() => import('react-chartjs-2').then((mod) => mod.Bar), {
  ssr: false,
});

const Line = dynamic(() => import('react-chartjs-2').then((mod) => mod.Line), {
  ssr: false,
});

type Props =
  | { type?: 'bar'; data: ChartData<'bar', unknown, unknown> }
  | { type: 'line'; data: ChartData<'line', unknown, unknown> };

const Chart = (props: Props) => {
  if (props.type === 'line') return <Line data={props.data} />;
  return <Bar data={props.data} />;
};

export default Chart;
