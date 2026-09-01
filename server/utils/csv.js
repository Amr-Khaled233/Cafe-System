/**
 * بيهرب القيمة عشان الفاصلة وعلامات التنصيص والأسطر ماتكسرش الملف.
 *
 * وكمان بيبطّل الصيغ: إكسل بيعتبر أي قيمة بتبدأ بـ = أو + أو - أو @ معادلة
 * وينفّذها لما الملف يتفتح. يعني اسم خامة زي =HYPERLINK("http://x","انقر")
 * يبقى ثغرة تنفيذ عند أي حد بيفتح التقرير. بنسبقها بفاصلة عليا فتتعرض كنص.
 */
function cell(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/**
 * بيبني CSV من صفوف + أعمدة معرّفة.
 * columns: [{ key, label }] — الـ label بييجي مترجم من الواجهة أو ثابت إنجليزي.
 */
export function toCSV(rows, columns) {
  const head = columns.map((c) => cell(c.label ?? c.key)).join(',');
  const body = rows
    .map((r) => columns.map((c) => cell(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(','))
    .join('\n');
  // BOM عشان إكسل يقرا العربي صح
  return '\uFEFF' + head + '\n' + body + '\n';
}

export function sendCSV(res, filename, rows, columns) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(toCSV(rows, columns));
}
