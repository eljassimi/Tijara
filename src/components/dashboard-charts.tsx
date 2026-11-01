"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid #F1E4D3",
  fontSize: 11,
};

export function PerformanceChart({
  data,
}: {
  data: { month: string; orders: number; delivered: number }[];
}) {
  return (
    <div className="chart-frame">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 10, right: 4, left: -25, bottom: 0 }}
        >
          <defs>
            <linearGradient id="tijaraChart" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3B3BF5" stopOpacity={0.32} />
              <stop offset="100%" stopColor="#3B3BF5" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#F1E4D3" vertical={false} />
          <XAxis
            dataKey="month"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fill: "#6B6A86" }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fill: "#6B6A86" }}
            allowDecimals={false}
          />
          <Tooltip contentStyle={tooltipStyle} />
          <Area
            type="monotone"
            dataKey="orders"
            stroke="#3B3BF5"
            strokeWidth={2}
            fill="url(#tijaraChart)"
          />
          <Area
            type="monotone"
            dataKey="delivered"
            stroke="#19C39C"
            strokeWidth={2}
            fill="transparent"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ConfirmationVolumeChart({
  data,
  labels,
}: {
  data: { month: string; confirmed: number; delivered: number }[];
  labels: { confirmed: string; delivered: string };
}) {
  return (
    <div className="chart-frame">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 10, right: 8, left: -18, bottom: 0 }}
          barGap={6}
        >
          <CartesianGrid stroke="#F1E4D3" vertical={false} />
          <XAxis
            dataKey="month"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fill: "#6B6A86" }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fill: "#6B6A86" }}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value, name) => [
              value as number,
              name === "confirmed" ? labels.confirmed : labels.delivered,
            ]}
          />
          <Bar
            dataKey="confirmed"
            name="confirmed"
            fill="#3B3BF5"
            radius={[8, 8, 0, 0]}
            maxBarSize={28}
          />
          <Bar
            dataKey="delivered"
            name="delivered"
            fill="#19C39C"
            radius={[8, 8, 0, 0]}
            maxBarSize={28}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ConfirmationEarningsChart({
  data,
  earningsLabel,
}: {
  data: { month: string; earnings: number }[];
  earningsLabel: string;
}) {
  return (
    <div className="chart-frame">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 10, right: 8, left: -8, bottom: 0 }}
        >
          <defs>
            <linearGradient id="confirmEarnings" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#19C39C" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#19C39C" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#F1E4D3" vertical={false} />
          <XAxis
            dataKey="month"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fill: "#6B6A86" }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fill: "#6B6A86" }}
            width={48}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value) => [`${Number(value).toFixed(2)} MAD`, earningsLabel]}
          />
          <Area
            type="monotone"
            dataKey="earnings"
            stroke="#0F9F7E"
            strokeWidth={2.5}
            fill="url(#confirmEarnings)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const colors = ["#3B3BF5", "#19C39C", "#FFB627", "#E2553F", "#14123A"];
export function StatusDonut({
  data,
}: {
  data: { name: string; value: number }[];
}) {
  return (
    <div className="donut-wrap">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={52}
            outerRadius={76}
            paddingAngle={3}
          >
            {data.map((item, index) => (
              <Cell key={item.name} fill={colors[index % colors.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
