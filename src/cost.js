// 成本核算核心逻辑（纯函数，无副作用，便于单元测试与前端复用）

// 四舍五入到分（2 位小数），用 EPSILON 消除浮点误差
export function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// 将任意输入转为有限数字，非法/缺失一律按 0 处理
function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// 单价 × 数量，四舍五入到分
export function computeSubtotal(unitPrice, quantity) {
  return round2(toNumber(unitPrice) * toNumber(quantity));
}

// 汇总总计：优先用已有 subtotal，否则按单价×数量回退计算
export function computeTotal(items) {
  return round2(
    items.reduce((sum, it) => {
      const subtotal = it.subtotal ?? computeSubtotal(it.unitPrice, it.quantity);
      return sum + subtotal;
    }, 0),
  );
}

function generateId() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return 'item-' + Math.random().toString(36).slice(2, 10);
}

// 创建行项：归一化字段并计算小计
export function createItem(draft = {}) {
  const unitPrice = toNumber(draft.unitPrice);
  const quantity = toNumber(draft.quantity);
  return {
    id: draft.id ?? generateId(),
    name: String(draft.name ?? '').trim(),
    unitPrice,
    priceUnit: String(draft.priceUnit ?? '').trim(),
    quantity,
    quantityUnit: String(draft.quantityUnit ?? '').trim(),
    subtotal: round2(unitPrice * quantity),
  };
}

export function addItem(items, draft) {
  return [...items, createItem(draft)];
}

export function removeItem(items, id) {
  return items.filter((it) => it.id !== id);
}

export function updateItem(items, id, patch = {}) {
  return items.map((it) => (it.id === id ? createItem({ ...it, ...patch, id }) : it));
}

export function duplicateItem(items, id) {
  const idx = items.findIndex((it) => it.id === id);
  if (idx === -1) return items;
  const copy = createItem({ ...items[idx], id: undefined });
  return [...items.slice(0, idx + 1), copy, ...items.slice(idx + 1)];
}

// 拖拽排序：把 fromIndex 行移动到 toIndex 位置
export function moveItem(items, fromIndex, toIndex) {
  if (fromIndex === toIndex) return items;
  if (fromIndex < 0 || fromIndex >= items.length) return items;
  if (toIndex < 0 || toIndex >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

// 批量添加多个类目
export function addItems(items, drafts) {
  return [...items, ...drafts.map((d) => createItem(d))];
}

// 解析批量文本：每行一个类目名；或从 Excel 粘贴「名称→单价→数量」三列（制表符分隔）
export function parseBulk(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('\t').map((s) => s.trim());
      if (parts.length >= 3) {
        return { name: parts[0], unitPrice: parts[1], quantity: parts[2] };
      }
      return { name: line };
    });
}
