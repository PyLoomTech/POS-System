/**
 * Phone number normalization utility for Nepal
 * Supports: +977-98XXXXXXXX, 098XXXXXXXX, 98XXXXXXXX
 */
export function normalizePhone(phone: string): string {
  // Remove all spaces, dashes, dots
  let normalized = phone.replace(/[\s\-\.]/g, '');

  // Remove country code prefix +977 or 977
  if (normalized.startsWith('+977')) normalized = normalized.slice(4);
  else if (normalized.startsWith('977')) normalized = normalized.slice(3);

  // Remove leading 0
  if (normalized.startsWith('0')) normalized = normalized.slice(1);

  return normalized;
}
