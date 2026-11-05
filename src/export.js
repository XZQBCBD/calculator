// 展示/导出层：金额格式化与 CSV 导出（纯函数）
import { round2 } from './cost.js';

function toFinite(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

// 显示用：两位小数 + 千分位，例如 1,234.50
export function formatMoney(n) {
  const v = round2(toFinite(n));
  const [int, dec] = v.toFixed(2).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${grouped}.${dec}`;
}

// 导出用：纯数字两位小数（无千分位，避免被 Excel 识别为文本）
function money(n) {
  return round2(toFinite(n)).toFixed(2);
}

function escapeCSV(s) {
  const str = String(s ?? '');
  if (/[",\r\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export function toCSV(items) {
  const header = '名称,单价,单价单位,数量,数量单位,小计';
  const rows = items.map((it) =>
    [it.name, money(it.unitPrice), it.priceUnit, String(toFinite(it.quantity)), it.quantityUnit, money(it.subtotal)]
      .map(escapeCSV)
      .join(','),
  );
  const total = items.reduce((s, it) => s + (it.subtotal ?? 0), 0);
  const totalRow = ['总计', '', '', '', '', money(total)].map(escapeCSV).join(',');
  return [header, ...rows, totalRow].join('\r\n');
}
