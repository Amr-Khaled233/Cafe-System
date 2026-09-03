import { useI18n } from '../i18n/index.jsx';

/**
 * صف جرد واحد.
 * الفرق بيتحسب لحظياً من اللي انت بتكتبه — من غير ما تستنى الحفظ.
 * العجز أحمر والزيادة أزرق.
 */
export default function StocktakeRow({ line, ingredient, onCount, readOnly }) {
  const { name, qty, money, numSigned } = useI18n();

  const counted = line.countedQty;
  const hasCount = counted !== null && counted !== undefined && counted !== '';
  const diff = hasCount ? Number(counted) - line.expectedQty : null;

  const tone = diff === null ? '' : diff < 0 ? 'text-bad' : diff > 0 ? 'text-info' : 'text-muted';
  const rowTone = diff === null ? '' : diff < 0 ? 'bg-bad-soft' : diff > 0 ? 'bg-info-soft' : '';

  return (
    <tr className={rowTone}>
      <td className="sticky-col font-semibold">{name(ingredient)}</td>
      <td className="tabular-nums text-muted">{qty(line.openingQty, ingredient?.unit)}</td>
      <td className="tabular-nums">{qty(line.purchasedQty, ingredient?.unit)}</td>
      <td className="tabular-nums">{qty(line.consumedQty, ingredient?.unit)}</td>
      <td className="tabular-nums">{qty(line.wasteQty, ingredient?.unit)}</td>
      <td className="tabular-nums text-muted">{qty(line.adjustedQty, ingredient?.unit)}</td>
      <td className="tabular-nums font-bold">{qty(line.expectedQty, ingredient?.unit)}</td>

      <td>
        {readOnly ? (
          <span className="tabular-nums font-semibold">{hasCount ? qty(counted, ingredient?.unit) : '—'}</span>
        ) : (
          // خانة إدخال كبيرة ورقمية — بتتملى بسرعة على تابلت في المخزن
          <input
            type="number"
            inputMode="decimal"
            className="field w-28 text-center text-base tabular-nums"
            value={hasCount ? counted : ''}
            onChange={(e) => onCount(e.target.value === '' ? null : Number(e.target.value))}
          />
        )}
      </td>

      <td className={`tabular-nums font-bold ${tone}`}>
        {diff === null ? '—' : numSigned(diff)}
      </td>
      <td className={`tabular-nums ${tone}`}>
        {diff === null ? '—' : money(diff * (line.unitCost || ingredient?.costPerUnit || 0))}
      </td>
    </tr>
  );
}
