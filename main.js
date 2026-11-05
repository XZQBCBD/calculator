// 前端 UI 层：DOM 绑定 + 渲染，复用已验证的纯函数
import {
  addItem, addItems, removeItem, updateItem, duplicateItem, moveItem,
  computeTotal, parseBulk, createItem, evalExpression, clearQuantities,
  findDuplicateNames, filterItems, createHistory, pushHistory, undoHistory,
} from './src/cost.js';
import { formatMoney, toCSV } from './src/export.js';
const STORAGE_KEY = 'cost-calculator:items';
const tbody = document.getElementById('rows');
const totalEl = document.getElementById('total');
const rowCountEl = document.getElementById('row-count');
const addBtn = document.getElementById('add-btn');
const exportBtn = document.getElementById('export-btn');
const bulkBtn = document.getElementById('bulk-btn');
const bulkPanel = document.getElementById('bulk-panel');
const bulkInput = document.getElementById('bulk-input');
const bulkConfirm = document.getElementById('bulk-confirm');
const bulkCancel = document.getElementById('bulk-cancel');
const clearQtyBtn = document.getElementById('clear-qty-btn');
const searchInput = document.getElementById('search-input');
const searchInfo = document.getElementById('search-info');
const undoBtn = document.getElementById('undo-btn');
const toastEl = document.getElementById('toast');
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
// ---------- 轻提示 ----------
let toastTimer = null;
function toast(msg, type = 'info') {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.className = 'toast'; }, 2200);
}
// ---------- 存储 ----------
function loadItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((it) => createItem(it));
    }
  } catch (e) { /* 数据损坏则忽略 */ }
  return [];
}
function saveItems(list) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch (e) { /* 静默降级 */ }
}
let items = loadItems();
if (items.length === 0) items = addItem(items, {});
// ---------- 撤销历史 ----------
let history = createHistory(30);
function snapshot() { history = pushHistory(history, items); }
function doUndo() {
  const r = undoHistory(history);
  if (!r.items) { toast('没有可撤销的操作'); return; }
  items = r.items.map((it) => createItem(it));
  history = r.history;
  renderRows();
  saveItems(items);
  toast('已撤销');
}
// ---------- 搜索 ----------
let keyword = '';
function visibleItems() { return filterItems(items, keyword); }
// ---------- 渲染 ----------
function renderRows() {
  const list = visibleItems();
  if (keyword) {
    searchInfo.textContent = list.length ? `找到 ${list.length} 个` : '无匹配';
    searchInfo.hidden = false;
  } else {
    searchInfo.hidden = true;
  }
  if (items.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8">还没有类目，点「＋ 添加类目」开始</td></tr>';
    updateTotal();
    return;
  }
  if (list.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8">没有匹配「' + escapeHtml(keyword) + '」的类目</td></tr>';
    updateTotal();
    return;
  }
  tbody.innerHTML = list.map((it) => `
    <tr data-id="${escapeHtml(it.id)}">
      <td class="drag"><span class="drag-handle" draggable="true" title="拖动排序">⠿</span></td>
      <td class="cell-lock" data-field-cell="name">
        <input data-field="name" value="${escapeHtml(it.name)}" placeholder="类目名称" autocomplete="off" readonly>
      </td>
      <td class="cell-lock" data-field-cell="unitPrice">
        <input class="num" data-field="unitPrice" type="text" inputmode="decimal" value="${it.unitPrice || ''}" placeholder="0.00" autocomplete="off" readonly>
      </td>
      <td class="unit cell-lock" data-field-cell="priceUnit">
        <input data-field="priceUnit" value="${escapeHtml(it.priceUnit)}" placeholder="元" autocomplete="off" readonly>
      </td>
      <td class="cell-qty">
        <input class="num qty-input" data-field="quantity" type="text" inputmode="decimal" value="${it.quantity || ''}" placeholder="0" autocomplete="off">
      </td>
      <td class="unit cell-lock" data-field-cell="quantityUnit">
        <input data-field="quantityUnit" value="${escapeHtml(it.quantityUnit)}" placeholder="件" autocomplete="off" readonly>
      </td>
      <td class="subtotal${it.subtotal ? '' : ' zero'}" title="${escapeHtml(it.name || '未命名')}：${it.unitPrice} × ${it.quantity} = ${formatMoney(it.subtotal)}">${formatMoney(it.subtotal)}</td>
      <td class="ops">
        <button class="dup" title="复制此行" aria-label="复制">⧉</button>
        <button class="del" title="长按删除" aria-label="删除">✕</button>
      </td>
    </tr>
  `).join('');
  updateTotal();
}
function updateTotal() {
  totalEl.textContent = formatMoney(computeTotal(items));
  if (rowCountEl) rowCountEl.textContent = String(items.length);
  if (undoBtn) undoBtn.disabled = history.stack.length === 0;
}
// ---------- 输入：数量框支持四则运算 ----------
tbody.addEventListener('input', (e) => {
  const input = e.target;
  const field = input.dataset.field;
  if (!field || input.readOnly) return;
  const tr = input.closest('tr');
  const id = tr.dataset.id;
  items = updateItem(items, id, { [field]: input.value });
  const item = items.find((it) => it.id === id);
  const cell = tr.querySelector('.subtotal');
  if (cell && item) {
    cell.textContent = formatMoney(item.subtotal);
    cell.classList.toggle('zero', !item.subtotal);
    cell.title = `${item.name || '未命名'}：${item.unitPrice} × ${item.quantity} = ${formatMoney(item.subtotal)}`;
  }
  updateTotal();
  saveItems(items);
});
// 数量框失焦/回车时结算表达式
function settleExpression(input) {
  if (!input || input.dataset.field !== 'quantity') return;
  const raw = input.value.trim();
  if (!raw) return;
  const val = evalExpression(raw);
  if (val === null) {
    // 非法表达式：还原为当前存储值，不打断
    const tr = input.closest('tr');
    const item = items.find((it) => it.id === tr.dataset.id);
    if (item) input.value = item.quantity || '';
    toast('表达式无法计算，已还原', 'warn');
    return;
  }
  const tr = input.closest('tr');
  const id = tr.dataset.id;
  const item = items.find((it) => it.id === id);
  if (item && item.quantity === val) { input.value = val || ''; return; }
  items = updateItem(items, id, { quantity: val });
  input.value = val || '';
  const it2 = items.find((x) => x.id === id);
  const cell = tr.querySelector('.subtotal');
  if (cell && it2) {
    cell.textContent = formatMoney(it2.subtotal);
    cell.classList.toggle('zero', !it2.subtotal);
    cell.title = `${it2.name || '未命名'}：${it2.unitPrice} × ${it2.quantity} = ${formatMoney(it2.subtotal)}`;
  }
  updateTotal();
  saveItems(items);
}
tbody.addEventListener('blur', (e) => {
  if (e.target.matches('input[data-field="quantity"]')) settleExpression(e.target);
}, true);
// ---------- 锁定字段：点一下解锁，失焦锁回 ----------
tbody.addEventListener('click', (e) => {
  const cell = e.target.closest('td.cell-lock');
  if (cell) {
    const input = cell.querySelector('input');
    if (input && input.readOnly) {
      input.readOnly = false;
      cell.classList.add('unlocked');
      input.focus();
      input.select();
    }
    return;
  }
  const btn = e.target.closest('button');
  if (!btn) return;
  const tr = btn.closest('tr');
  const id = tr.dataset.id;
  if (btn.classList.contains('del')) {
    // 长按删除：由 pointerdown 计时器处理，这里只处理已确认的
    return;
  }
  if (btn.classList.contains('dup')) {
    snapshot();
    items = duplicateItem(items, id);
    renderRows();
    saveItems(items);
    toast('已复制一行');
  }
});
// 锁定字段失焦后重新锁上
tbody.addEventListener('focusout', (e) => {
  const input = e.target;
  if (!input.matches || !input.matches('input')) return;
  const cell = input.closest('td.cell-lock');
  if (!cell) return;
  setTimeout(() => {
    if (document.activeElement === input) return;
    input.readOnly = true;
    cell.classList.remove('unlocked');
  }, 120);
});
// ---------- 删除：长按 0.6 秒 ----------
let pressTimer = null;
let pressedBtn = null;
tbody.addEventListener('pointerdown', (e) => {
  const btn = e.target.closest('button.del');
  if (!btn) return;
  pressedBtn = btn;
  btn.classList.add('pressing');
  pressTimer = setTimeout(() => {
    const tr = btn.closest('tr');
    const id = tr.dataset.id;
    const item = items.find((it) => it.id === id);
    snapshot();
    items = removeItem(items, id);
    if (items.length === 0) items = addItem(items, {});
    renderRows();
    saveItems(items);
    toast(`已删除「${item?.name || '未命名'}」`);
    btn.classList.remove('pressing');
    pressTimer = null;
    pressedBtn = null;
  }, 600);
});
function cancelPress() {
  if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
  if (pressedBtn) { pressedBtn.classList.remove('pressing'); pressedBtn = null; }
}
tbody.addEventListener('pointerup', cancelPress);
tbody.addEventListener('pointerleave', cancelPress);
tbody.addEventListener('pointercancel', cancelPress);
// ---------- 拖拽排序 ----------
let dragIndex = null;
tbody.addEventListener('dragstart', (e) => {
  const handle = e.target.closest('.drag-handle');
  if (!handle) return;
  const tr = handle.closest('tr');
  dragIndex = [...tbody.children].indexOf(tr);
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tr.dataset.id);
  }
  tr.classList.add('dragging');
});
tbody.addEventListener('dragend', () => {
  dragIndex = null;
  tbody.querySelectorAll('tr').forEach((tr) => tr.classList.remove('dragging', 'drag-over'));
});
tbody.addEventListener('dragover', (e) => {
  if (dragIndex === null) return;
  e.preventDefault();
  const tr = e.target.closest('tr');
  if (!tr) return;
  tbody.querySelectorAll('tr').forEach((r) => r.classList.remove('drag-over'));
  tr.classList.add('drag-over');
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
});
tbody.addEventListener('drop', (e) => {
  if (dragIndex === null) return;
  e.preventDefault();
  const tr = e.target.closest('tr');
  if (!tr) return;
  const toIndex = [...tbody.children].indexOf(tr);
  snapshot();
  items = moveItem(items, dragIndex, toIndex);
  dragIndex = null;
  renderRows();
  saveItems(items);
});
// ---------- 键盘：Enter 跳格 / 结算表达式 ----------
tbody.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
    e.preventDefault();
    if (e.target.dataset.field === 'quantity') settleExpression(e.target);
    // 遍历全部输入框（含只读），跳转时自动解锁目标字段
    const inputs = [...tbody.querySelectorAll('input')];
    const idx = inputs.indexOf(e.target);
    let next = inputs[idx + 1];
    if (!next) {
      addBtn.click();
      next = tbody.querySelector('tr:last-child input');
    }
    if (next) {
      const cell = next.closest('td.cell-lock');
      if (cell && next.readOnly) {
        next.readOnly = false;
        cell.classList.add('unlocked');
      }
      next.focus();
      next.select();
    }
    return;
  }
  if (e.key === 'Escape' && e.target.tagName === 'INPUT') {
    const cell = e.target.closest('td.cell-lock');
    if (cell) {
      e.target.readOnly = true;
      cell.classList.remove('unlocked');
      e.target.blur();
    }
  }
});
// 数字框聚焦全选
tbody.addEventListener('focusin', (e) => {
  if (e.target.matches('input.num')) e.target.select();
});
// ---------- 添加单行（含重名提醒） ----------
addBtn.addEventListener('click', () => {
  snapshot();
  items = addItem(items, {});
  renderRows();
  saveItems(items);
  const last = tbody.lastElementChild;
  const nameInput = last?.querySelector('[data-field="name"]');
  if (nameInput) {
    const cell = nameInput.closest('td.cell-lock');
    nameInput.readOnly = false;
    cell?.classList.add('unlocked');
    nameInput.focus();
  }
});
// ---------- 批量添加（含重名提醒） ----------
bulkBtn.addEventListener('click', () => {
  bulkPanel.hidden = !bulkPanel.hidden;
  if (!bulkPanel.hidden) bulkInput.focus();
});
bulkCancel.addEventListener('click', () => {
  bulkPanel.hidden = true;
  bulkInput.value = '';
});
bulkConfirm.addEventListener('click', () => {
  const drafts = parseBulk(bulkInput.value);
  if (drafts.length === 0) return;
  // 重名检测：新名称与已有名称冲突时提醒
  const conflicts = [];
  for (const d of drafts) {
    const n = String(d.name ?? '').trim();
    if (!n) continue;
    if (items.some((it) => String(it.name ?? '').trim() === n) || conflicts.includes(n)) {
      if (!conflicts.includes(n)) conflicts.push(n);
    }
  }
  if (conflicts.length) {
    const ok = confirm(`以下类目已存在，确定还要添加吗？\n\n${conflicts.join('、')}`);
    if (!ok) return;
  }
  snapshot();
  items = addItems(items, drafts);
  bulkInput.value = '';
  bulkPanel.hidden = true;
  renderRows();
  saveItems(items);
  toast(`已添加 ${drafts.length} 个类目`);
});
// ---------- A. 清空所有数量 ----------
clearQtyBtn?.addEventListener('click', () => {
  const hasQty = items.some((it) => Number(it.quantity) > 0);
  if (!hasQty) { toast('当前没有需要清空的数量'); return; }
  const ok = confirm(`确定清空全部 ${items.length} 个类目的数量？\n\n名称、单价、单位会保留，小计与总成本归零。`);
  if (!ok) return;
  snapshot();
  items = clearQuantities(items);
  renderRows();
  saveItems(items);
  toast('已清空全部数量');
  // 聚焦第一行数量框，方便直接开录
  const firstQty = tbody.querySelector('input[data-field="quantity"]');
  firstQty?.focus();
});
// ---------- 5. 搜索 ----------
searchInput?.addEventListener('input', (e) => {
  keyword = e.target.value;
  renderRows();
});
// ---------- 8. 撤销 ----------
undoBtn?.addEventListener('click', doUndo);
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return; // 输入框内交给浏览器原生撤销
    e.preventDefault();
    doUndo();
  }
});
// ---------- 导出 CSV ----------
exportBtn.addEventListener('click', () => {
  const csv = toCSV(items);
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '成本核算.csv';
  a.click();
  URL.revokeObjectURL(url);
});
renderRows();