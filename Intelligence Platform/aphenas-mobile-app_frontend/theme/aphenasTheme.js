export const colors = {
  bg: '#F8FFF8',
  panel: '#FFFFFF',
  soft: '#FFF8F8',
  softAlt: '#F9F2F2',
  green: '#0E6505',
  greenDark: '#0A5603',
  text: '#101010',
  muted: '#8A8A8A',
  faint: '#CFCFCF',
  line: '#E2E2E2',
  bubble: '#252525',
  watermark: '#BFE7D5',
};

export const radius = {
  field: 5,
  pill: 28,
  modal: 14,
};

export function initials(value, fallback = 'CO') {
  const source = String(value || fallback).trim();
  if (!source) return fallback;
  const compact = source
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return compact || source.slice(0, 2).toUpperCase();
}

export function formatListTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase();
}
