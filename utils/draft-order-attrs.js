/** 不在后台展示的 Draft Order 自定义属性（冗长 JSON / 内部 ID） */
export const HIDDEN_DRAFT_ORDER_ATTR_KEYS = new Set([
  '加工特征摘要',
  '估价明细',
  '_uuid',
]);

export function filterDraftOrderAttributes(attrs = []) {
  return (attrs || []).filter(
    (attr) => attr?.key && !HIDDEN_DRAFT_ORDER_ATTR_KEYS.has(attr.key),
  );
}

export function stripHiddenDraftOrderAttributes(attrs = []) {
  return filterDraftOrderAttributes(attrs);
}
