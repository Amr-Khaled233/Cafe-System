import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useApi, useAction } from '../hooks/useApi.js';
import { api } from '../api/client.js';
import { PageHeader } from '../components/Layout.jsx';
import { EmptyState, ErrorState, InlineError, Skeleton, SkeletonTable, useToast } from '../components/ui.jsx';

export default function Recipes() {
  const { t, name, money, qty, num, pct } = useI18n();
  const { push } = useToast();
  const { run, busy, error: actionError, clearError } = useAction();

  const menu = useApi('/menu');
  const ingredients = useApi('/ingredients');
  const [selectedId, setSelectedId] = useState(null);
  const [lines, setLines] = useState([]);

  const recipe = useApi(selectedId ? `/menu/${selectedId}/recipe` : null, [selectedId], { skip: !selectedId });

  // أول ما نفتح صنف، بنجيب وصفته في حالة قابلة للتعديل
  useEffect(() => {
    if (recipe.data) {
      setLines(recipe.data.lines.map((l) => ({ ingredientId: l.ingredientId, qty: l.qty })));
    }
  }, [recipe.data]);

  const ingById = Object.fromEntries((ingredients.data || []).map((i) => [i._id, i]));
  const selected = (menu.data || []).find((m) => m._id === selectedId);

  /* الحسابات لحظية — بتتغيّر مع كل تعديل قبل ما تحفظ */
  const cost = lines.reduce((s, l) => s + (ingById[l.ingredientId]?.costPerUnit || 0) * (Number(l.qty) || 0), 0);
  const price = selected?.price || 0;
  const profit = price - cost;
  const marginPct = price > 0 ? (profit / price) * 100 : 0;

  const maxServings = lines.length
    ? Math.floor(
        Math.min(
          ...lines.map((l) => {
            const ing = ingById[l.ingredientId];
            const q = Number(l.qty) || 0;
            if (!ing || q <= 0) return Infinity;
            return ing.currentQty / q;
          })
        )
      )
    : null;

  const setLine = (idx, patch) => setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, { ingredientId: ingredients.data?.[0]?._id || '', qty: 0 }]);
  const removeLine = (idx) => setLines((ls) => ls.filter((_, i) => i !== idx));

  const save = async () => {
    clearError();
    try {
      await run(() =>
        api.put(`/menu/${selectedId}/recipe`, {
          recipe: lines.filter((l) => l.ingredientId).map((l) => ({ ingredientId: l.ingredientId, qty: Number(l.qty) || 0 })),
        })
      );
      push({ message: t('common.saved') });
      recipe.reload();
      menu.reload();
    } catch {
      /* معروض تحت */
    }
  };

  return (
    <div>
      <PageHeader title={t('recipes.title')} subtitle={t('recipes.subtitle')} />

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        {/* قائمة الأصناف */}
        <div className="card">
          <h2 className="mb-2 text-sm font-bold">{t('menuAdmin.items')}</h2>
          {menu.loading && <Skeleton className="h-64" />}
          {menu.error && <ErrorState error={menu.error} onRetry={menu.reload} />}
          <div className="max-h-[60vh] space-y-1 overflow-y-auto">
            {(menu.data || []).map((m) => (
              <button
                key={m._id}
                type="button"
                onClick={() => setSelectedId(m._id)}
                className={`flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl px-3 text-start text-sm font-semibold ${
                  selectedId === m._id ? 'bg-accent text-white' : 'hover:bg-surface2'
                }`}
              >
                <span className="truncate">{name(m)}</span>
                <span className="shrink-0 tabular-nums opacity-70">{money(m.price)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* محرّر الوصفة */}
        <div className="card">
          {!selectedId && <EmptyState icon="☕" title={t('recipes.selectItem')} hint={t('recipes.subtitle')} />}

          {selectedId && recipe.loading && <SkeletonTable rows={5} cols={4} />}

          {selectedId && !recipe.loading && (
            <>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold">{t('recipes.recipeFor', { name: name(selected) })}</h2>
                  <p className="text-sm text-muted">
                    {t('common.price')}: {money(price)} ·{' '}
                    {selected?.trackStock ? t('recipes.trackStock') : t('recipes.trackStockOff')}
                  </p>
                </div>
                <button type="button" className="btn-primary btn-sm" onClick={save} disabled={busy}>
                  {busy ? t('common.saving') : t('common.save')}
                </button>
              </div>

              {/* الأرقام اللحظية */}
              <div className="mb-4 grid grid-cols-3 gap-3">
                <Stat label={t('recipes.itemCost')} value={money(cost)} />
                <Stat
                  label={t('recipes.itemProfit')}
                  value={`${money(profit)} · ${pct(marginPct)}`}
                  tone={marginPct < 40 ? 'warn' : 'good'}
                />
                <Stat
                  label={t('recipes.maxServings')}
                  value={maxServings === null ? '—' : num(Math.max(0, maxServings))}
                  tone={maxServings === 0 ? 'bad' : undefined}
                />
              </div>

              {lines.length === 0 && <EmptyState icon="⊕" title={t('recipes.noRecipe')} hint={t('recipes.noRecipeHint')} />}

              {lines.length > 0 && (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th className="sticky-col">{t('common.ingredient')}</th>
                        <th>{t('recipes.perServing')}</th>
                        <th>{t('inventory.costPerUnit')}</th>
                        <th>{t('recipes.lineCost')}</th>
                        <th>{t('recipes.available')}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l, idx) => {
                        const ing = ingById[l.ingredientId];
                        const lineCost = (ing?.costPerUnit || 0) * (Number(l.qty) || 0);
                        const enough = ing && Number(l.qty) > 0 ? ing.currentQty >= Number(l.qty) : true;
                        return (
                          <tr key={idx} className={enough ? '' : 'bg-bad-soft'}>
                            <td className="sticky-col">
                              <select
                                className="field min-w-[150px]"
                                value={l.ingredientId}
                                onChange={(e) => setLine(idx, { ingredientId: e.target.value })}
                              >
                                {(ingredients.data || []).map((i) => (
                                  <option key={i._id} value={i._id}>
                                    {name(i)}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  min="0"
                                  className="field w-24 text-center tabular-nums"
                                  value={l.qty}
                                  onChange={(e) => setLine(idx, { qty: e.target.value })}
                                />
                                <span className="text-xs text-muted">{ing ? t(`units.${ing.unit}`) : ''}</span>
                              </div>
                            </td>
                            <td className="tabular-nums">{money(ing?.costPerUnit || 0)}</td>
                            <td className="tabular-nums font-semibold">{money(lineCost)}</td>
                            <td className={`tabular-nums ${enough ? 'text-muted' : 'font-bold text-bad'}`}>
                              {ing ? qty(ing.currentQty, ing.unit) : '—'}
                            </td>
                            <td>
                              <button
                                type="button"
                                className="btn-icon text-bad"
                                aria-label={t('common.delete')}
                                onClick={() => removeLine(idx)}
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="mt-3 flex items-center gap-2">
                <button type="button" className="btn-ghost btn-sm" onClick={addLine}>
                  {t('recipes.addLine')}
                </button>
              </div>

              <div className="mt-3">
                <InlineError error={actionError} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className="rounded-xl border border-line bg-surface2 p-3">
      <p className="text-xs text-muted">{label}</p>
      <p
        className={`text-sm font-bold tabular-nums ${
          tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : tone === 'good' ? 'text-good' : ''
        }`}
      >
        {value}
      </p>
    </div>
  );
}
