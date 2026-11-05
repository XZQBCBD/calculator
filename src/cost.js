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

// ---------- v2 新增 ----------

// 安全解析四则运算表达式：支持 + - * / × ÷ 全角括号与空格
// 非法表达式返回 null（不抛异常），结果四舍五入到 2 位小数
export function evalExpression(input) {
  if (input === null || input === undefined) return null;
  let s = String(input).trim();
  if (!s) return null;
  // 全角转半角
  s = s
    .replace(/[×✕]/g, '*')
    .replace(/[÷]/g, '/')
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
    .replace(/[＋]/g, '+')
    .replace(/[－—]/g, '-')
    .replace(/[＊]/g, '*')
    .replace(/[／]/g, '/')
    .replace(/\s+/g, '');
  // 只允许数字、小数点、运算符、括号
  if (!/^[0-9+\-*/().]+$/.test(s)) return null;
  // 纯数字直接返回
  if (/^[0-9.]+$/.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) ? round2(n) : null;
  }
  // 用递归下降解析，避免 eval 的安全与性能问题
  let pos = 0;
  function peek() { return s[pos]; }
  // allowUnary：仅在表达式开头或左括号后允许一元正负号
  function parseExpr(allowUnary = true) {
    let v = parseTerm(allowUnary);
    if (v === null) return null;
    while (peek() === '+' || peek() === '-') {
      const op = s[pos++];
      const r = parseTerm(false); // 二元运算符后禁止一元符号
      if (r === null) return null;
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  function parseTerm(allowUnary = false) {
    let v = parseFactor(allowUnary);
    if (v === null) return null;
    while (peek() === '*' || peek() === '/') {
      const op = s[pos++];
      const r = parseFactor(false); // 乘除后禁止一元符号
      if (r === null) return null;
      if (op === '/' && r === 0) return null; // 除零视为非法
      v = op === '*' ? v * r : v / r;
    }
    return v;
  }
  function parseFactor(allowUnary = false) {
    if (peek() === '(') {
      pos++;
      const v = parseExpr(true);
      if (v === null) return null;
      if (peek() !== ')') return null;
      pos++;
      return v;
    }
    // 一元符号：只有 allowUnary 时才接受，且只允许一个
    let sign = 1;
    if (allowUnary && (peek() === '-' || peek() === '+')) {
      if (s[pos++] === '-') sign = -1;
      if (peek() !== '(' && !/[0-9.]/.test(peek() ?? '')) return null;
    }
    const start = pos;
    while (pos < s.length && /[0-9.]/.test(s[pos])) pos++;
    if (pos === start) return null;
    const numStr = s.slice(start, pos);
    // 拒绝多个小数点
    if ((numStr.match(/\./g) || []).length > 1) return null;
    const n = Number(numStr);
    if (!Number.isFinite(n)) return null;
    return sign * n;
  }
  const result = parseExpr();
  if (result === null) return null;
  if (pos !== s.length) return null; // 有剩余字符说明表达式非法
  if (!Number.isFinite(result)) return null;
  return round2(result);
}

// 清空所有数量，保留名称/单价/单位（纯函数）
export function clearQuantities(items) {
  return items.map((it) => createItem({ ...it, quantity: 0, id: it.id }));
}

// 找出重复的类目名称（忽略空名称与首尾空白）
// 传入 extraName 时，额外检查该名称是否与已有重复
export function findDuplicateNames(items, extraName) {
  const seen = new Map();
  const dups = new Set();
  for (const it of items) {
    const n = String(it.name ?? '').trim();
    if (!n) continue;
    if (seen.has(n)) dups.add(n);
    else seen.set(n, true);
  }
  if (extraName !== undefined && extraName !== null) {
    const n = String(extraName).trim();
    if (n && seen.has(n)) dups.add(n);
  }
  return [...dups];
}

// 按名称关键词过滤（不区分大小写），空关键词返回全部
export function filterItems(items, keyword) {
  const k = String(keyword ?? '').trim().toLowerCase();
  if (!k) return items;
  return items.filter((it) => String(it.name ?? '').toLowerCase().includes(k));
}

// 撤销历史栈：保存最近 N 步快照
export function createHistory(limit = 20) {
  return { stack: [], limit };
}

// 压入快照（深拷贝，避免后续修改污染历史）
export function pushHistory(history, items) {
  const snapshot = JSON.parse(JSON.stringify(items));
  const stack = [...history.stack, snapshot];
  const limit = history.limit ?? 20;
  if (stack.length > limit) stack.splice(0, stack.length - limit);
  return { ...history, stack };
}

// 撤销：弹出最近快照，返回 { items, history }
export function undoHistory(history) {
  if (!history.stack.length) return { items: null, history };
  const stack = history.stack.slice(0, -1);
  const items = history.stack[history.stack.length - 1];
  return { items, history: { ...history, stack } };
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
