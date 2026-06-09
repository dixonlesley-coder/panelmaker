/**
 * Power-factor correction (capacitor bank) reference data. In Indonesia PLN
 * applies a reactive-power (kVARh) penalty when the average power factor falls
 * below ~0.85; correction is typically designed to ~0.95.
 */

/** Power factor below which a PLN reactive-power penalty applies. */
export const PF_PENALTY_THRESHOLD = 0.85;

/** Default correction target power factor. */
export const PF_TARGET_DEFAULT = 0.95;

/** Standard automatic power-factor-correction bank ratings (kVAR). */
export const CAPACITOR_BANK_KVAR = [
  10, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500, 600, 800, 1000,
] as const;

/** Smallest standard bank covering the required kVAR. */
export function selectCapacitorBankKvar(requiredKvar: number): number {
  return (
    CAPACITOR_BANK_KVAR.find((k) => k >= requiredKvar) ??
    CAPACITOR_BANK_KVAR[CAPACITOR_BANK_KVAR.length - 1]!
  );
}

/** Step size (kVAR) for an automatic bank of a given total. */
export function capacitorStepKvar(bankKvar: number): number {
  if (bankKvar <= 50) return 5;
  if (bankKvar <= 150) return 25;
  return 50;
}
