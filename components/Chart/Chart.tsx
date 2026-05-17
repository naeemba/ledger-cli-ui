'use client';

import * as React from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { cn } from '@/lib/utils';

export type ChartSeries = {
  key: string;
  label: string;
  color?: string;
};

type Props = {
  type?: 'bar' | 'line' | 'area';
  data: Array<Record<string, string | number>>;
  xKey: string;
  series: ChartSeries[];
  height?: number;
  className?: string;
  stacked?: boolean;
  valueFormatter?: (value: number) => string;
  showLegend?: boolean;
  hideXAxis?: boolean;
  hideYAxis?: boolean;
};

const DEFAULT_PALETTE = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
];

const Chart = ({
  type = 'bar',
  data,
  xKey,
  series,
  height = 280,
  className,
  stacked = false,
  valueFormatter,
  showLegend = true,
  hideXAxis = false,
  hideYAxis = false,
}: Props) => {
  const config = React.useMemo<ChartConfig>(() => {
    return Object.fromEntries(
      series.map((s, idx) => [
        s.key,
        {
          label: s.label,
          color: s.color ?? DEFAULT_PALETTE[idx % DEFAULT_PALETTE.length],
        },
      ])
    );
  }, [series]);

  const tooltip = (
    <ChartTooltip
      cursor={{ fill: 'var(--muted)', fillOpacity: 0.3 }}
      content={
        <ChartTooltipContent
          indicator={type === 'line' ? 'line' : 'dot'}
          formatter={
            valueFormatter
              ? (value) => valueFormatter(Number(value))
              : undefined
          }
        />
      }
    />
  );

  const legend =
    showLegend && series.length > 1 ? (
      <ChartLegend content={<ChartLegendContent />} />
    ) : null;

  const xAxis = !hideXAxis ? (
    <XAxis
      dataKey={xKey}
      tickLine={false}
      axisLine={false}
      tickMargin={8}
      minTickGap={16}
    />
  ) : null;

  const yAxis = !hideYAxis ? (
    <YAxis
      tickLine={false}
      axisLine={false}
      tickMargin={8}
      width={64}
      tickFormatter={valueFormatter}
    />
  ) : null;

  const grid = <CartesianGrid vertical={false} strokeDasharray="3 3" />;

  const containerProps = {
    config,
    className: cn('aspect-auto w-full', className),
    style: { height },
  } as const;

  if (type === 'line') {
    return (
      <ChartContainer {...containerProps}>
        <LineChart
          accessibilityLayer
          data={data}
          margin={{ left: 4, right: 12, top: 8, bottom: 4 }}
        >
          {grid}
          {xAxis}
          {yAxis}
          {tooltip}
          {legend}
          {series.map((s) => (
            <Line
              key={s.key}
              dataKey={s.key}
              type="monotone"
              stroke={`var(--color-${s.key})`}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ChartContainer>
    );
  }

  if (type === 'area') {
    return (
      <ChartContainer {...containerProps}>
        <AreaChart
          accessibilityLayer
          data={data}
          margin={{ left: 4, right: 12, top: 8, bottom: 4 }}
        >
          <defs>
            {series.map((s) => (
              <linearGradient
                key={s.key}
                id={`fill-${s.key}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor={`var(--color-${s.key})`}
                  stopOpacity={0.35}
                />
                <stop
                  offset="100%"
                  stopColor={`var(--color-${s.key})`}
                  stopOpacity={0.02}
                />
              </linearGradient>
            ))}
          </defs>
          {grid}
          {xAxis}
          {yAxis}
          {tooltip}
          {legend}
          {series.map((s) => (
            <Area
              key={s.key}
              dataKey={s.key}
              type="monotone"
              stroke={`var(--color-${s.key})`}
              fill={`url(#fill-${s.key})`}
              strokeWidth={2}
              stackId={stacked ? 'a' : undefined}
            />
          ))}
        </AreaChart>
      </ChartContainer>
    );
  }

  return (
    <ChartContainer {...containerProps}>
      <BarChart
        accessibilityLayer
        data={data}
        margin={{ left: 4, right: 12, top: 8, bottom: 4 }}
      >
        {grid}
        {xAxis}
        {yAxis}
        {tooltip}
        {legend}
        {series.map((s) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            fill={`var(--color-${s.key})`}
            radius={[6, 6, 0, 0]}
            stackId={stacked ? 'a' : undefined}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
};

export default Chart;
