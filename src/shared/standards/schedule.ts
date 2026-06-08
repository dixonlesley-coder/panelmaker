/**
 * Daily load-schedule presets and the hourly on/off expansion used to build the
 * building load profile. Continuous loads run all 24 hours; scheduled loads
 * (e.g. daytime air-conditioning, overnight EV charging) run within a window.
 */

import type { LoadSchedule } from '../types/project';

export interface SchedulePreset {
  key: string;
  label: string;
  /** Absent = continuous (24 h). */
  schedule?: LoadSchedule;
}

export const SCHEDULE_PRESETS: readonly SchedulePreset[] = [
  { key: 'continuous', label: 'Continuous (24 h)' },
  { key: 'office', label: 'Office hours (08-18)', schedule: { startHour: 8, endHour: 18 } },
  { key: 'daytime', label: 'Daytime AC (09-17)', schedule: { startHour: 9, endHour: 17 } },
  { key: 'evening', label: 'Evening (17-23)', schedule: { startHour: 17, endHour: 23 } },
  { key: 'overnight', label: 'Overnight / EV (22-06)', schedule: { startHour: 22, endHour: 6 } },
];

/** 24 hourly factors (1 inside the operating window, else 0); handles midnight wrap. */
export function hourlyFactors(schedule?: LoadSchedule): number[] {
  const f = new Array<number>(24).fill(0);
  if (!schedule) return f.fill(1);
  const { startHour, endHour } = schedule;
  for (let h = 0; h < 24; h++) {
    const on = startHour <= endHour ? h >= startHour && h < endHour : h >= startHour || h < endHour;
    f[h] = on ? 1 : 0;
  }
  return f;
}

/** Resolve a schedule back to a preset key for the UI (or 'custom'). */
export function presetKeyFor(schedule?: LoadSchedule): string {
  if (!schedule) return 'continuous';
  const found = SCHEDULE_PRESETS.find(
    (p) => p.schedule && p.schedule.startHour === schedule.startHour && p.schedule.endHour === schedule.endHour,
  );
  return found?.key ?? 'custom';
}
