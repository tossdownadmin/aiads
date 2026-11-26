import {metaCurrencyDigits} from '../meta/currency';
/** Exact base-ten arithmetic. JSON stores decimal strings, never binary floats. */
type Decimal = { n: bigint; scale: number };
function unpack(value: string): Decimal {
  if (!/^-?\d{1,36}(?:\.\d{1,18})?$/.test(value)) throw Error('Invalid decimal');
  const [whole, fraction = ''] = value.split('.');
  return { n: BigInt(whole + fraction), scale: fraction.length };
}
function packed(n: bigint, scale: number) {
  const sign = n < 0n ? '-' : '', digits = (n < 0n ? -n : n).toString().padStart(scale + 1, '0');
  return sign + (scale ? (digits.slice(0, -scale) + '.' + digits.slice(-scale)).replace(/\.?0+$/, '') : digits);
}
export function decimal(value: unknown): string | null {
  // Meta money arrives as a string. Only exact integer JSON numbers are accepted.
  const raw = typeof value === 'string' ? value : typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : '';
  if (!/^\d{1,30}(?:\.\d{1,12})?$/.test(raw)) return null;
  const x = unpack(raw); return packed(x.n, x.scale);
}
export function add(a: string, b: string) { const x = unpack(a), y = unpack(b), s = Math.max(x.scale, y.scale); return packed(x.n * 10n ** BigInt(s - x.scale) + y.n * 10n ** BigInt(s - y.scale), s); }
export function subtract(a: string, b: string) { return add(a, b.startsWith('-') ? b.slice(1) : '-' + b); }
export function compare(a: string, b: string) { const x = unpack(subtract(a,b)).n; return x < 0n ? -1 : x > 0n ? 1 : 0; }
export function multiply(a: string, b: string) { const x = unpack(a), y = unpack(b); return packed(x.n * y.n, x.scale + y.scale); }
export function divide(a: string, b: string, precision = 6): string | null {
  const x = unpack(a), y = unpack(b); if (y.n === 0n) return null;
  const numerator = x.n * 10n ** BigInt(y.scale + precision), denominator = y.n * 10n ** BigInt(x.scale);
  const negative = (numerator < 0n) !== (denominator < 0n), n = numerator < 0n ? -numerator : numerator, d = denominator < 0n ? -denominator : denominator;
  const rounded = (n + d / 2n) / d;
  return packed(negative ? -rounded : rounded, precision);
}
export function sum(values: string[]) { return values.reduce(add, '0'); }
export function changePercent(current: string | null, previous: string | null) { return current === null || previous === null ? null : divide(multiply(subtract(current, previous), '100'), previous); }
export function formatDecimal(value: string | null, digits?: number): string {
  if (value === null) return '—';
  let raw = value;
  if (digits !== undefined) {
    const x = unpack(value), negative = x.n < 0n, n = negative ? -x.n : x.n;
    const divisor = 10n ** BigInt(Math.max(0,x.scale-digits));
    const rounded = x.scale > digits ? (n + divisor / 2n) / divisor : n * 10n ** BigInt(digits-x.scale);
    const d = rounded.toString().padStart(digits+1,'0');
    raw = (negative && rounded ? '-' : '') + (digits ? d.slice(0,-digits)+'.'+d.slice(-digits) : d);
  }
  const [whole,fraction] = raw.split('.');
  const negativeFraction=whole.startsWith('-')&&BigInt(whole)===0n&&fraction&&/[1-9]/.test(fraction);
  return (negativeFraction?'-':'')+new Intl.NumberFormat('en').format(BigInt(whole)) + (fraction === undefined ? '' : '.' + fraction);
}
export function formatMoney(value: string | null, currency: string) {
  if (value === null) return '—';
  const digits = metaCurrencyDigits(currency);
  return currency + ' ' + formatDecimal(value,digits);
}
