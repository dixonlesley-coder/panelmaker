/** Small presentation-only formatting helpers used across the renderer. */

/** Format an IDR amount with thousands separators (no decimals). */
export function formatIdr(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Format watts as kW with one decimal. */
export function formatKw(watts: number): string {
  return `${(watts / 1000).toFixed(1)} kW`;
}

/** Format a number of amperes with one decimal and an `A` suffix. */
export function formatAmps(amps: number): string {
  return `${amps.toFixed(1)} A`;
}

/** Format a percentage value already expressed in percent (e.g. 3.2 -> "3.2%"). */
export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}
