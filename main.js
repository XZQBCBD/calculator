// 前端 UI 层：DOM 绑定 + 渲染，复用已验证的纯函数
import { addItem, addItems, removeItem, updateItem, duplicateItem, moveItem, computeTotal, parseBulk, createItem } from './src/cost.js';
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
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
// 从 localStorage 读取并逐条归一化：历史脏数据（缺字段/类型错）在这里被洗干净
function loadItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((it) => createItem(it));
      }
    }
  } catch (e) { /* 数据损坏则忽略，重新开始 */ }
  return [];
}
function saveItems(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (e) { /* 存储不可用时静默降级，不影响使用 */ }
}
let items = loadItems();
if (items.length === 0) items = addItem(items, {});
function renderRows() {
  tbody.innerHTML = items.map((it) => `
    <tr data-id="${escapeHtml(it.id)}">
      <td class="drag"><span class="drag-handle" draggable="true" title="拖动排序">⠿</span></td>
      <td><input data-field="name" value="${escapeHtml(it.name)}" placeholder="类目名称" autocomplete="off"></td>
      <td><input class="num" data-field="unitPrice" type="number" step="0.01" min="0" value="${it.unitPrice || ''}" placeholder="0.00" autocomplete="off"></td>
      <td class="unit"><input data-field="priceUnit" value="${escapeHtml(it.priceUnit)}" placeholder="元" autocomplete="off"></td>
      <td><input class="num" data-field="quantity" type="number" step="any" min="0" value="${it.quantity || ''}" placeholder="0" autocomplete="off"></td>
      <td class="unit"><input data-field="quantityUnit" value="${escapeHtml(it.quantityUnit)}" placeholder="件" autocomplete="off"></td>
      <td class="subtotal${it.subtotal ? '' : ' zero'}">${formatMoney(it.subtotal)}</td>
      <td class="ops">
        <button class="dup" title="复制此行" aria-label="复制">⧉</button>
        <button class="del" title="删除此行" aria-label="删除">✕</button>
      </td>
    </tr>
  `).join('');
  updateTotal();
}
function updateTotal() {
  totalEl.textContent = formatMoney(computeTotal(items));
  if (rowCountEl) rowCountEl.textContent = String(items.length);
}
// 事件委托：内联编辑（精准更新小计与总计，保留输入焦点）
tbody.addEventListener('input', (e) => {
  const input = e.target;
  const field = input.dataset.field;
  if (!field) return;
  const tr = input.closest('tr');
  const id = tr.dataset.id;
  items = updateItem(items, id, { [field]: input.value });
  const item = items.find((it) => it.id === id);
  const cell = tr.querySelector('.subtotal');
  cell.textContent = formatMoney(item.subtotal);
  cell.classList.toggle('zero', !item.subtotal);
  updateTotal();
  saveItems(items);
});
// 事件委托：复制 / 删除
tbody.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const id = btn.closest('tr').dataset.id;
  if (btn.classList.contains('del')) {
    items = removeItem(items, id);
    if (items.length === 0) items = addItem(items, {}); // 删空后至少保留一行
  } else if (btn.classList.contains('dup')) {
    items = duplicateItem(items, id);
  }
  renderRows();
  saveItems(items);
});
// 拖拽排序
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
  items = moveItem(items, dragIndex, toIndex);
  dragIndex = null;
  renderRows();
  saveItems(items);
});
// 键盘交互：Enter 跳到下一格，最后一行末格自动新增行
tbody.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
  e.preventDefault();
  const inputs = [...tbody.querySelectorAll('input')];
  const idx = inputs.indexOf(e.target);
  let next = inputs[idx + 1];
  if (!next) {
    addBtn.click();
    next = tbody.querySelector('tr:last-child input');
  }
  next?.focus();
  next?.select();
});
// 数字输入框聚焦时全选，便于直接覆盖
tbody.addEventListener('focusin', (e) => {
  if (e.target.matches('input[type="number"]')) e.target.select();
});
// 添加单行
addBtn.addEventListener('click', () => {
  items = addItem(items, {});
  renderRows();
  saveItems(items);
  tbody.lastElementChild?.querySelector('[data-field="name"]')?.focus();
});
// 批量添加
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
  items = addItems(items, drafts);
  bulkInput.value = '';
  bulkPanel.hidden = true;
  renderRows();
  saveItems(items);
});
// 导出 CSV
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