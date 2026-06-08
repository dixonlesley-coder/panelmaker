import { PUMP_TEMPLATES, DEFAULT_SENSING } from '../../standards/control/pump';
import type {
  AssemblyDevice,
  ControlAssembly,
  LevelSensing,
  PartCategory,
  PumpControlMode,
} from '../../types';

function sensorCategory(role: string): PartCategory {
  if (role.includes('level-relay')) return 'level_relay';
  if (role.includes('electrode')) return 'electrode_assembly';
  if (role.includes('float')) return 'float_switch';
  if (role.includes('pressure')) return 'pressure_transmitter';
  if (role.includes('alternator')) return 'alternator_relay';
  return 'level_sensor';
}

/**
 * Layer a pump/level control scheme onto an existing motor-starter assembly:
 * add the required sensing devices, record the pump configuration, and flag
 * missing protections (e.g. dry-run on a fill pump).
 */
export function applyPumpControl(
  assembly: ControlAssembly,
  mode: PumpControlMode,
  sensing?: LevelSensing,
): ControlAssembly {
  const tmpl = PUMP_TEMPLATES[mode];
  const resolvedSensing = sensing ?? DEFAULT_SENSING[mode];

  const sensorDevices: AssemblyDevice[] = tmpl.requiredSensors.map((role) => ({
    id: `${assembly.circuitId}:${role}`,
    role,
    category: sensorCategory(role),
    qty: 1,
    rating: '-',
    heatLossW: 0,
    widthMm: 36,
  }));

  const warnings = [...assembly.warnings];
  const hasDryRun = tmpl.protections.some((p) => p.toLowerCase().includes('dry-run'));
  if (mode === 'fill' && !hasDryRun) {
    warnings.push('Fill pump should include dry-run / source-low protection.');
  }

  return {
    ...assembly,
    devices: [...assembly.devices, ...sensorDevices],
    pump: { mode, sensing: resolvedSensing, requiredSensors: tmpl.requiredSensors },
    warnings,
  };
}
