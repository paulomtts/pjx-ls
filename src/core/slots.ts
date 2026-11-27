/** True when an attribute value's trimmed content looks like HTML/component markup (a slot). */
export function isHtmlSlotValue(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed.startsWith("<")) {
    return false;
  }
  return /<(?:\/|[A-Za-z])/.test(trimmed);
}
