import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useApi, useAction } from '../hooks/useApi.js';
import { api } from '../api/client.js';
import { PageHeader } from '../components/Layout.jsx';
import { EmptyState, ErrorState, InlineError, Skeleton, SkeletonTable, useToast } from '../components/ui.jsx';

/** بيحسب تكلفة وصفة والحد الأقصى للأكواب من الأرصدة الحالية */
function evaluate(lines, ingById) {
  const cost = lines.reduce(
    (s, l) => s + (ingById[l.ingredientId]?.costPerUnit || 0) * (Number(l.qty) || 0),
    0
  );
  const servings = lines.length
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
  return { cost, servings: Number.isFinite(servings) ? Math.max(0, servings) : null };
}

export default function Recipes() {
  const { t, name, money, money2, qty, num, pct } = useI18n();
  const { push } = useToast();
  const { run, busy, error: actionError, clearError } = useAction();

  const menu = useApi('/menu');
  const ingredients = useApi('/ingredients');
  const [selectedId, setSelectedId] = useState(null);

  const [base, setBase] = useState([]);
  const [variants, setVariants] = useState([]);

  const recipe = useApi(selectedId ? `/menu/${selectedId}/recipe` : null, [selectedId], { skip: !selectedId });

  useEffect(() => {
    if (!recipe.data) return;
    setBase(recipe.data.lines.map((l) => ({ ingredientId: l.ingredientId, qty: l.qty })));
    setVariants(
      (recipe.data.variants || []).map((v) => ({
        _id: v._id,
        nameAr: v.nameAr,
        nameEn: v.nameEn,
        priceDelta: v.priceDelta || 0,
        available: v.available !== false,
        recipe: v.lines.map((l) => ({ ingredientId: l.ingredientId, qty: l.qty })),
      }))
    );
  }, [recipe.data]);

  const ingById = Object.fromEntries((ingredients.data || []).map((i) => [i._id, i]));

  /**
   * تكلفة الصنف في القايمة.
   * الصنف اللي ليه أنواع بناخد أرخص نوع كمؤشر — الأنواع بتختلف في السكر بس
   * فالفرق بينهم صغير، والتفاصيل الكاملة جوّه الصنف.
   */
  const itemCost = (m) => {
    const lists = m.variants?.length ? m.variants.map((v) => v.recipe || []) : [m.recipe || []];
    const costs = lists.map((lines) => evaluate(lines.map((l) => ({ ingredientId: String(l.ingredientId), qty: l.qty })), ingById).cost);
    return costs.length ? Math.min(...costs) : 0;
  };
  const itemMargin = (m) => (m.price > 0 ? ((m.price - itemCost(m)) / m.price) * 100 : 0);
  const selected = (menu.data || []).find((m) => m._id === selectedId);
  const price = selected?.price || 0;

  const save = async () => {
    clearError();
    try {
      await run(() =>
        api.put(`/menu/${selectedId}/recipe`, {
          recipe: base.filter((l) => l.ingredientId).map((l) => ({ ingredientId: l.ingredientId, qty: Number(l.qty) || 0 })),
          variants: variants.map((v) => ({
            _id: v._id,
            nameAr: v.nameAr,
            nameEn: v.nameEn,
            priceDelta: Number(v.priceDelta) || 0,
            available: v.available,
            recipe: v.recipe.filter((l) => l.ingredientId).map((l) => ({ ingredientId: l.ingredientId, qty: Number(l.qty) || 0 })),
          })),
        })
      );
      push({ message: t('common.saved') });
      recipe.reload();
      menu.reload();
    } catch {
      /* معروض تحت */
    }
  };

  const addVariant = () =>
    setVariants((vs) => [
      ...vs,
      { nameAr: '', nameEn: '', priceDelta: 0, available: true, recipe: base.map((l) => ({ ...l })) },
    ]);

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
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    {name(m)}
                    {m.variants?.length > 0 && (
                      <span className="ms-1 text-xs font-normal opacity-70">({num(m.variants.length)})</span>
                    )}
                  </span>
                  {/* التكلفة والهامش على طول في القايمة — تعرف بيكلفك كام قبل ما تفتحه */}
                  <span className="block text-[11px] font-normal opacity-70">
                    <span className="tabular-nums">{money2(itemCost(m))}</span>
                    {' → '}
                    <span className="tabular-nums">{pct(itemMargin(m))}</span>
                  </span>
                </span>
                <span className="shrink-0 tabular-nums opacity-70">{money(m.price)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* المحرّر */}
        <div className="space-y-4">
          {!selectedId && (
            <div className="card">
              <EmptyState icon="☕" title={t('recipes.selectItem')} hint={t('recipes.subtitle')} />
            </div>
          )}

          {selectedId && recipe.loading && (
            <div className="card">
              <SkeletonTable rows={5} cols={4} />
            </div>
          )}

          {selectedId && !recipe.loading && (
            <>
              <div className="card">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold">{t('recipes.recipeFor', { name: name(selected) })}</h2>
                    <p className="text-sm text-muted">
                      {t('common.price')}: {money2(price)} ·{' '}
                      {selected?.trackStock ? t('recipes.trackStock') : t('recipes.trackStockOff')}
                    </p>
                  </div>
                  <button type="button" className="btn-primary btn-sm" onClick={save} disabled={busy}>
                    {busy ? t('common.saving') : t('common.save')}
                  </button>
                </div>

                <InlineError error={actionError} />

                {/* الوصفة الأساسية */}
                <h3 className="mb-1 text-sm font-bold">{t('recipes.baseRecipe')}</h3>
                <p className="mb-3 text-xs text-muted">{t('recipes.baseRecipeHint')}</p>

                <RecipeEditor
                  lines={base}
                  onChange={setBase}
                  ingredients={ingredients.data || []}
                  ingById={ingById}
                  price={price}
                  showTotals={variants.length === 0}
                />
              </div>

              {/* الأنواع */}
              <div className="card">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold">{t('recipes.variants')}</h3>
                    <p className="text-xs text-muted">{t('recipes.variantsHint')}</p>
                  </div>
                  <button type="button" className="btn-ghost btn-sm" onClick={addVariant}>
                    {t('recipes.addVariant')}
                  </button>
                </div>

                {variants.length === 0 && (
                  <EmptyState icon="⊞" title={t('recipes.noVariants')} hint={t('recipes.noVariantsHint')} />
                )}

                <div className="space-y-4">
                  {variants.map((v, vi) => {
                    const { cost, servings } = evaluate(v.recipe, ingById);
                    const finalPrice = price + (Number(v.priceDelta) || 0);
                    const profit = finalPrice - cost;
                    const margin = finalPrice > 0 ? (profit / finalPrice) * 100 : 0;

                    const setV = (patch) =>
                      setVariants((vs) => vs.map((x, i) => (i === vi ? { ...x, ...patch } : x)));

                    return (
                      <div key={v._id || vi} className="rounded-2xl border border-line p-3">
                        <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_1fr_120px_auto]">
                          <div>
                            <span className="label">{t('common.nameAr')}</span>
                            <input
                              className="field"
                              value={v.nameAr}
                              onChange={(e) => setV({ nameAr: e.target.value })}
                            />
                          </div>
                          <div>
                            <span className="label">{t('common.nameEn')}</span>
                            <input
                              className="field"
                              value={v.nameEn}
                              onChange={(e) => setV({ nameEn: e.target.value })}
                            />
                          </div>
                          <div>
                            <span className="label">{t('recipes.priceDelta')}</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              className="field tabular-nums"
                              value={v.priceDelta}
                              onChange={(e) => setV({ priceDelta: e.target.value })}
                            />
                          </div>
                          <div className="flex items-end gap-1">
                            <button
                              type="button"
                              className="btn-icon text-bad"
                              aria-label={t('recipes.removeVariant')}
                              onClick={() => setVariants((vs) => vs.filter((_, i) => i !== vi))}
                            >
                              ✕
                            </button>
                          </div>
                        </div>

                        <div className="mb-3 flex flex-wrap items-center gap-3">
                          <label className="flex items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={v.available}
                              onChange={(e) => setV({ available: e.target.checked })}
                            />
                            {t('recipes.variantAvailable')}
                          </label>
                          <button
                            type="button"
                            className="text-xs text-accent underline"
                            onClick={() => setV({ recipe: base.map((l) => ({ ...l })) })}
                          >
                            {t('recipes.copyFromBase')}
                          </button>
                        </div>

                        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <Stat label={t('recipes.finalPrice')} value={money2(finalPrice)} />
                          <Stat label={t('recipes.itemCost')} value={money2(cost)} />
                          <Stat
                            label={t('recipes.itemProfit')}
                            value={`${money2(profit)} · ${pct(margin)}`}
                            tone={margin < 40 ? 'warn' : 'good'}
                          />
                          <Stat
                            label={t('recipes.maxServings')}
                            value={servings === null ? '—' : num(servings)}
                            tone={servings === 0 ? 'bad' : undefined}
                          />
                        </div>

                        <RecipeEditor
                          lines={v.recipe}
                          onChange={(lines) => setV({ recipe: lines })}
                          ingredients={ingredients.data || []}
                          ingById={ingById}
                          price={finalPrice}
                          showTotals={false}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** جدول سطور وصفة واحدة — بيتستخدم للأساسية ولكل نوع */
function RecipeEditor({ lines, onChange, ingredients, ingById, price, showTotals }) {
  const { t, name, money2, qty, num, pct } = useI18n();

  const setLine = (idx, patch) => onChange(lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const addLine = () => onChange([...lines, { ingredientId: ingredients[0]?._id || '', qty: 0 }]);
  const removeLine = (idx) => onChange(lines.filter((_, i) => i !== idx));

  const { cost, servings } = evaluate(lines, ingById);
  const profit = price - cost;
  const margin = price > 0 ? (profit / price) * 100 : 0;

  return (
    <div>
      {showTotals && (
        <div className="mb-3 grid grid-cols-3 gap-2">
          <Stat label={t('recipes.itemCost')} value={money2(cost)} />
          <Stat
            label={t('recipes.itemProfit')}
            value={`${money2(profit)} · ${pct(margin)}`}
            tone={margin < 40 ? 'warn' : 'good'}
          />
          <Stat
            label={t('recipes.maxServings')}
            value={servings === null ? '—' : num(servings)}
            tone={servings === 0 ? 'bad' : undefined}
          />
        </div>
      )}

      {lines.length === 0 ? (
        <p className="py-3 text-sm text-muted">{t('recipes.noRecipeHint')}</p>
      ) : (
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
                        {ingredients.map((i) => (
                          <option key={i._id} value={i._id}>
                            {name(i)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <QtyInput
                        line={l}
                        ing={ing}
                        onChange={(patch) => setLine(idx, patch)}
                      />
                    </td>
                    <td className="tabular-nums">{money2(ing?.costPerUnit || 0)}</td>
                    <td className="tabular-nums font-semibold">{money2(lineCost)}</td>
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

      <button type="button" className="btn-ghost btn-sm mt-2" onClick={addLine}>
        {t('recipes.addLine')}
      </button>
    </div>
  );
}

/**
 * إدخال الكمية بالمكيال أو بوحدة الأساس.
 * اللي بيتخزّن دايماً وحدة الأساس — المكيال بيضرب في معامله وخلاص،
 * عشان كل الحسابات (التكلفة، الجرد، الخصم) تفضل على أساس واحد.
 */
function QtyInput({ line, ing, onChange }) {
  const { t, num, name } = useI18n();
  const measures = ing?.measures || [];
  // -1 = وحدة الأساس
  const mi = line.__measure ?? -1;
  const factor = mi >= 0 && measures[mi] ? measures[mi].factor : 1;
  const shown = factor ? Number(line.qty || 0) / factor : 0;

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        inputMode="decimal"
        min="0"
        step="any"
        className="field w-20 text-center tabular-nums"
        value={Number.isFinite(shown) ? Math.round(shown * 1000) / 1000 : ''}
        onChange={(e) => onChange({ qty: (Number(e.target.value) || 0) * factor })}
      />

      {measures.length > 0 ? (
        <select
          className="field w-auto min-w-[92px] text-xs"
          value={mi}
          onChange={(e) => onChange({ __measure: Number(e.target.value) })}
        >
          <option value={-1}>{ing ? t('units.' + ing.unit) : ''}</option>
          {measures.map((m, i) => (
            <option key={i} value={i}>
              {name(m)}
            </option>
          ))}
        </select>
      ) : (
        <span className="text-xs text-muted">{ing ? t('units.' + ing.unit) : ''}</span>
      )}

      {/* لما تدخّل بالمكيال بنوضّح الناتج بوحدة الأساس عشان مافيش لبس */}
      {mi >= 0 && (
        <span className="whitespace-nowrap text-[11px] text-muted">
          = {num(Number(line.qty) || 0)} {ing ? t('units.' + ing.unit) : ''}
        </span>
      )}
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className="rounded-xl border border-line bg-surface2 p-2">
      <p className="text-[11px] text-muted">{label}</p>
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
