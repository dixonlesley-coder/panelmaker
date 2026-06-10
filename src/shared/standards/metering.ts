/**
 * PLN service-connection and revenue-metering reference data.
 *
 * `PLN_TARIFF_STEPS_VA` are the standard connected-power (daya tersambung)
 * steps offered for LV (TR) service. Demand beyond the LV ceiling moves the
 * connection to MV (TM) with primary metering. CT-operated metering applies
 * above the direct (whole-current) meter limit.
 */

/** Standard PLN LV (TR) connected-power steps, VA, ascending. */
export const PLN_TARIFF_STEPS_VA: readonly number[] = [
  450, 900, 1300, 2200, 3500, 4400, 5500, 7700, 11000, 13900, 16500, 23000,
  33000, 41500, 53000, 66000, 82500, 105000, 131000, 147000, 164000, 197000,
];

/** LV (TR) service ceiling (VA); beyond it the connection is MV (TM). */
export const PLN_LV_MAX_VA = 197000;

/** Direct (whole-current) kWh-meter limit (A); above it metering is CT-operated. */
export const DIRECT_METER_MAX_A = 100;

/** Standard metering CT primary ratings (A), secondary 5 A. */
export const CT_PRIMARY_A: readonly number[] = [
  50, 75, 100, 150, 200, 250, 300, 400, 500, 600, 800, 1000, 1250, 1600, 2000, 2500,
];

/** Revenue-metering CT accuracy class. */
export const METERING_CT_CLASS = '0.5S';
