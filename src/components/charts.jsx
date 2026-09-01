import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useI18n } from '../i18n/index.jsx';
import { EmptyState, Skeleton } from './ui.jsx';

/**
 * لوحة ألوان مُتحقّق منها لعمى الألوان في الوضعين (فاتح وغامق).
 * الترتيب ثابت — الصنف بياخد لونه من ترتيبه في القائمة، مش من ترتيبه في النتيجة،
 * عشان تغيير الفلتر مايعيدش تلوين اللي فاضل.
 */
const CATEGORICAL = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300'],
};

// تدرّج لوني بلون واحد فاتح ← غامق، للخريطة الحرارية (المقدار مش الهوية)
const SEQUENTIAL = {
  light: ['#eef4fb', '#cfe0f4', '#a5c6ea', '#6ea3dc', '#3d81cf', '#1b5fae'],
  dark: ['#1b2430', '#1f3550', '#264a75', '#2d619c', '#3579c4', '#4a92dd'],
};

/** بيتابع تبديل الدارك مود عشان الرسوم تتلوّن للسطح الصح */
export function useChartTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark')));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  const mode = dark ? 'dark' : 'light';
  return {
    dark,
    series: CATEGORICAL[mode],
    ramp: SEQUENTIAL[mode],
    grid: dark ? '#2e3541' : '#e0e4eb',
    axis: dark ? '#919baa' : '#6e7684',
    surface: dark ? '#161a21' : '#ffffff',
  };
}

/** إطار موحّد: عنوان + حالة تحميل + حالة فاضية + مكان للأزرار */
export function ChartCard({ title, action, loading, empty, height = 260, children }) {
  const { t } = useI18n();
  return (
    <div className="card min-w-0 overflow-hidden">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold">{title}</h2>
        {action}
      </div>
      {loading ? (
        <Skeleton className={`h-[${height}px] w-full`} />
      ) : empty ? (
        <EmptyState icon="◌" title={t('common.empty')} />
      ) : (
        children
      )}
    </div>
  );
}

/** تلميح موحّد — كل رسم عنده تلميح، مفيش رسم أرقامه مخفية */
function TipBox({ rows, label }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      {label && <p className="mb-1 font-bold">{label}</p>}
      {rows.map((r, i) => (
        <p key={i} className="flex items-center gap-2 tabular-nums">
          {r.color && <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />}
          <span className="text-muted">{r.name}</span>
          <span className="font-semibold">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 *  المبيعات على الوقت — خط واحد، فمفيش legend محتاجينه
 * ------------------------------------------------------------------ */
export function SalesLine({ rows, granularity }) {
  const { money, num, date } = useI18n();
  const theme = useChartTheme();

  const fmtBucket = (b) =>
    granularity === 'hour'
      ? date(b, { hour: '2-digit', minute: '2-digit' })
      : date(b, { day: '2-digit', month: 'short' });

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={theme.grid} vertical={false} />
        <XAxis
          dataKey="bucket"
          tickFormatter={fmtBucket}
          tick={{ fill: theme.axis, fontSize: 11 }}
          axisLine={{ stroke: theme.grid }}
          tickLine={false}
          minTickGap={24}
        />
        <YAxis
          tick={{ fill: theme.axis, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={52}
          tickFormatter={(v) => num(v)}
        />
        <Tooltip
          cursor={{ stroke: theme.grid }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <TipBox
                label={fmtBucket(label)}
                rows={[
                  { name: '', value: money(payload[0].payload.revenue), color: theme.series[0] },
                  { name: '', value: num(payload[0].payload.orders) },
                ]}
              />
            ) : null
          }
        />
        <Line
          type="monotone"
          dataKey="revenue"
          stroke={theme.series[0]}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: theme.surface }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------------------------------------------ *
 *  أكتر الأصناف — أعمدة أفقية، الأسماء ظاهرة كـ labels مباشرة
 * ------------------------------------------------------------------ */
export function HorizontalBars({ rows, labelKey, valueKey, formatValue, colorIndex = 0 }) {
  const theme = useChartTheme();
  const { name } = useI18n();

  const data = rows.map((r) => ({ ...r, __label: labelKey ? r[labelKey] : name(r) }));
  const height = Math.max(200, data.length * 34 + 24);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 44, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={theme.grid} horizontal={false} />
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="__label"
          width={112}
          tick={{ fill: theme.axis, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: theme.grid, fillOpacity: 0.35 }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TipBox
                label={payload[0].payload.__label}
                rows={[{ name: '', value: formatValue(payload[0].value), color: theme.series[colorIndex] }]}
              />
            ) : null
          }
        />
        <Bar
          dataKey={valueKey}
          fill={theme.series[colorIndex]}
          radius={[0, 4, 4, 0]}
          barSize={16}
          label={{
            position: 'right',
            fill: theme.axis,
            fontSize: 11,
            formatter: (v) => formatValue(v),
          }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------------------------------------------ *
 *  المبيعات حسب التصنيف — دونات + legend بالقيم (شرط الوضوح)
 * ------------------------------------------------------------------ */
export function CategoryDonut({ rows }) {
  const { name, money, pct } = useI18n();
  const theme = useChartTheme();

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <ResponsiveContainer width="100%" height={200} className="max-w-[220px]">
        <PieChart>
          <Pie
            data={rows}
            dataKey="revenue"
            nameKey="nameAr"
            innerRadius="58%"
            outerRadius="88%"
            paddingAngle={2}
            stroke={theme.surface}
            strokeWidth={2}
          >
            {rows.map((r, i) => (
              <Cell key={r.categoryId || i} fill={theme.series[i % theme.series.length]} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) =>
              active && payload?.length ? (
                <TipBox
                  label={name(payload[0].payload)}
                  rows={[
                    { name: '', value: money(payload[0].payload.revenue), color: payload[0].payload.__c },
                    { name: '', value: pct(payload[0].payload.pct) },
                  ]}
                />
              ) : null
            }
          />
        </PieChart>
      </ResponsiveContainer>

      {/* الـ legend بيحمل القيم كمان — عشان الهوية ماتبقاش باللون بس */}
      <ul className="w-full flex-1 space-y-2">
        {rows.map((r, i) => (
          <li key={r.categoryId || i} className="flex items-center gap-2 text-xs">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: theme.series[i % theme.series.length] }}
            />
            <span className="flex-1 truncate">{name(r)}</span>
            <span className="font-semibold tabular-nums">{money(r.revenue)}</span>
            <span className="w-12 text-end tabular-nums text-muted">{pct(r.pct)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 *  ساعات الذروة — خريطة حرارية يوم × ساعة بتدرّج لون واحد
 * ------------------------------------------------------------------ */
export function PeakHeatmap({ rows, max }) {
  const { t, num } = useI18n();
  const theme = useChartTheme();

  const byKey = Object.fromEntries(rows.map((r) => [`${r.dow}-${r.hour}`, r]));
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const days = [1, 2, 3, 4, 5, 6, 7];

  const colorFor = (v) => {
    if (!v) return theme.dark ? '#1a1f28' : '#f3f5f9';
    const step = Math.min(theme.ramp.length - 1, Math.ceil((v / (max || 1)) * theme.ramp.length) - 1);
    return theme.ramp[Math.max(0, step)];
  };

  return (
    // الوقت بيمشي من الشمال لليمين زي رسم المبيعات بالظبط، حتى في الواجهة العربية
    <div className="table-wrap" dir="ltr">
      <table className="w-full min-w-[620px] table-fixed border-separate border-spacing-0.5">
        <thead>
          <tr>
            <th className="w-14" />
            {hours.map((h) => (
              <th key={h} className="pb-1 text-[9px] font-normal text-muted">
                {h % 3 === 0 ? num(h) : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d}>
              <td className="pe-2 text-end text-[11px] font-semibold text-muted">{t(`weekdays.${d}`)}</td>
              {hours.map((h) => {
                const cell = byKey[`${d}-${h}`];
                return (
                  <td key={h}>
                    <div
                      className="h-6 rounded-[3px]"
                      style={{ background: colorFor(cell?.orders) }}
                      title={`${t(`weekdays.${d}`)} ${num(h)}:00 — ${num(cell?.orders || 0)}`}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-2 flex items-center gap-2 text-[11px] text-muted" dir="ltr">
        <span>{t('dashboard.quiet')}</span>
        {theme.ramp.map((c) => (
          <span key={c} className="h-3 w-5 rounded-[3px]" style={{ background: c }} />
        ))}
        <span>{t('dashboard.busy')}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 *  طرق الدفع — أعمدة مكدّسة على محور واحد
 * ------------------------------------------------------------------ */
export function PaymentStacked({ rows }) {
  const { t, money, pct } = useI18n();
  const theme = useChartTheme();

  const total = rows.reduce((s, r) => s + r.revenue, 0);
  if (!total) return null;

  return (
    <div className="space-y-3">
      {/* عمود واحد مكدّس — بينهم فاصل 2px عشان الحدود تبان */}
      <div className="flex h-8 w-full gap-0.5 overflow-hidden rounded-lg">
        {rows.map((r, i) => (
          <div
            key={r.method}
            style={{ width: `${(r.revenue / total) * 100}%`, background: theme.series[i % theme.series.length] }}
            title={`${t(`paymentMethods.${r.method}`)} — ${money(r.revenue)}`}
          />
        ))}
      </div>

      <ul className="space-y-2">
        {rows.map((r, i) => (
          <li key={r.method} className="flex items-center gap-2 text-xs">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: theme.series[i % theme.series.length] }}
            />
            <span className="flex-1">{t(`paymentMethods.${r.method}`)}</span>
            <span className="font-semibold tabular-nums">{money(r.revenue)}</span>
            <span className="w-12 text-end tabular-nums text-muted">{pct(r.pct)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
