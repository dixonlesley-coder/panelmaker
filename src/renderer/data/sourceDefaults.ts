/**
 * Canonical "just enabled" starting configurations for the distributed energy
 * sources — shared by the Sources screen and the canvas palette's source cards
 * so both entry points enable a source with identical defaults.
 */

import type { BatteryConfig, GeneratorConfig, SolarConfig } from '@shared/types';

export const DEFAULT_GENERATOR: GeneratorConfig = { enabled: false, backupFraction: 1, mode: 'standby' };
export const DEFAULT_SOLAR: SolarConfig = { enabled: false, targetKwp: 50, panelWp: 550, dcAcRatio: 1.2 };
export const DEFAULT_BATTERY: BatteryConfig = { enabled: false, backupKw: 10, autonomyHours: 4, chemistry: 'lifepo4' };
