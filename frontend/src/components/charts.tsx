import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtMoney } from "../api";

export interface MonthlyPoint {
  /** Display label, e.g. "Mar 26". */
  month: string;
  spending: number;
  made: number;
  lost: number;
  net: number;
  /** YYYY-MM key of the point. */
  key?: string;
}

interface TooltipEntry {
  name?: string | number;
  dataKey?: string | number;
  value?: unknown;
  color?: string;
}

interface TooltipViewProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
}

const AXIS_TICK = { fill: "#737373", fontSize: 11 };
const GRID_STROKE = "#f0f0f0";

function compact(n: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact" }).format(n);
}

function yTick(tick: number): string {
  if (tick === 0) return "0";
  const sign = tick < 0 ? "-" : "";
  return sign + "$" + compact(Math.abs(tick));
}

function CustomTooltip({ active, payload, label }: TooltipViewProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 shadow-sm">
      <p className="text-xs font-medium text-neutral-900">{label}</p>
      <div className="mt-1 space-y-0.5">
        {payload.map((entry) => (
          <p key={String(entry.dataKey)} className="flex items-center gap-2 text-xs text-neutral-600">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: entry.color }}
            />
            <span className="capitalize">{entry.name}</span>
            <span className="ml-auto font-medium tabular-nums text-neutral-900">
              {fmtMoney(Number(entry.value ?? 0))}
            </span>
          </p>
        ))}
      </div>
    </div>
  );
}

const SERIES = [
  { key: "spending", name: "Spending", fill: "#d4d4d4" },
  { key: "made", name: "Made", fill: "#10b981" },
  { key: "lost", name: "Lost", fill: "#ef4444" },
] as const;

export function MonthlyBarChart({ data }: { data: MonthlyPoint[] }) {
  return (
    <div className="h-64 w-full sm:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barGap={2}>
          <CartesianGrid stroke={GRID_STROKE} strokeWidth={1} vertical={false} />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={{ stroke: "#e5e5e5" }}
            tick={AXIS_TICK}
            interval="preserveStartEnd"
          />
          <YAxis tickLine={false} axisLine={false} tick={AXIS_TICK} width={52} tickFormatter={yTick} />
          <Tooltip cursor={{ fill: "#fafafa" }} content={<CustomTooltip />} />
          {SERIES.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.fill} radius={[3, 3, 0, 0]} maxBarSize={16} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function CustomLineTooltip({ active, payload, label }: TooltipViewProps) {
  if (!active || !payload?.length) return null;
  const value = Number(payload[0]?.value ?? 0);
  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 shadow-sm">
      <p className="text-xs font-medium text-neutral-900">{label}</p>
      <p className="mt-1 text-xs text-neutral-600">
        Cumulative net&nbsp;
        <span className={`font-medium tabular-nums ${value >= 0 ? "text-emerald-600" : "text-red-600"}`}>
          {fmtMoney(value)}
        </span>
      </p>
    </div>
  );
}

export function NetLineChart({ data }: { data: Array<MonthlyPoint & { cumNet: number }> }) {
  return (
    <div className="h-56 w-full sm:h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID_STROKE} strokeWidth={1} vertical={false} />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={{ stroke: "#e5e5e5" }}
            tick={AXIS_TICK}
            interval="preserveStartEnd"
          />
          <YAxis tickLine={false} axisLine={false} tick={AXIS_TICK} width={52} tickFormatter={yTick} />
          <Tooltip cursor={{ stroke: "#d4d4d4", strokeDasharray: "3 3" }} content={<CustomLineTooltip />} />
          <Line
            type="monotone"
            dataKey="cumNet"
            name="Cumulative net"
            stroke="#171717"
            strokeWidth={2}
            dot={{ r: 2.5, fill: "#171717", strokeWidth: 0 }}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
