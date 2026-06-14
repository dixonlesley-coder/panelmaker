/**
 * Pump-group control engine. Given a group of pump circuits and a control scheme
 * (single-alternate / parallel-alternate / lead-lag / parallel / cascade) driven
 * by a shared water-level controller, timer or pressure transmitter, derive the
 * shared control gear, the cross-pump interlocks, and the group control
 * (ladder) schematic. Pure — no Node/DOM, fully fixture-testable.
 */

import {
  PUMP_GROUP_MODES,
  PUMP_GROUP_TRIGGERS,
} from '../../standards/control/pumpGroup';
import { DEFAULT_SENSING } from '../../standards/control/pump';
import type {
  AssemblyDevice,
  ControlAssembly,
  ControlSchematic,
  DeviceElement,
  Interlock,
  PartCategory,
  PumpGroupConfig,
  PumpGroupResult,
  SchematicRung,
  SchematicSymbol,
  SchematicSymbolType,
} from '../../types';

/** A resolved member of a pump group: an existing pump/motor circuit. */
export interface PumpGroupMember {
  circuitId: string;
  name: string;
  /** The member's own sized starter assembly, when it has one. */
  control?: ControlAssembly;
}

/** Short device-friendly tag for a member (e.g. "P1"). */
function shortTag(index: number): string {
  return `P${index + 1}`;
}

/** Resolve the member's run-coil device id (main contactor / bypass / drive). */
function runCoilId(member: PumpGroupMember): string {
  const byRole = (role: string) => member.control?.devices.find((d) => d.role === role)?.id;
  return (
    byRole('main-contactor') ??
    byRole('bypass-contactor') ??
    byRole('drive') ??
    `${member.circuitId}:run`
  );
}

function overloadId(member: PumpGroupMember): string | undefined {
  return member.control?.devices.find((d) => d.role === 'overload')?.id;
}

/**
 * Build the group control schematic: a demand rung from the trigger, an optional
 * alternator step, then one run rung per member carrying the staging / alternation
 * select contact, the cross-pump interlock contact and the member's overload.
 */
function buildGroupSchematic(
  config: PumpGroupConfig,
  members: PumpGroupMember[],
  controllerId: string | undefined,
  alternatorId: string | undefined,
): ControlSchematic {
  const cid = `group:${config.id}`;
  const modeDef = PUMP_GROUP_MODES[config.mode];
  const rungs: SchematicRung[] = [];
  const symbols: SchematicSymbol[] = [];
  let rungSeq = 0;
  let symSeq = 0;

  const addRung = (label: string): string => {
    const id = `${cid}:r${rungSeq++}`;
    rungs.push({ id, order: rungs.length, label, generated: true, locked: true });
    return id;
  };
  const addSym = (
    rungId: string,
    type: SchematicSymbolType,
    col: number,
    opts: { label?: string; deviceId?: string; element?: DeviceElement } = {},
  ): void => {
    const sym: SchematicSymbol = {
      id: `${cid}:s${symSeq++}`,
      rungId,
      type,
      col,
      branch: 0,
      generated: true,
    };
    if (opts.label !== undefined) sym.label = opts.label;
    if (opts.deviceId !== undefined) {
      sym.deviceRef = { deviceId: opts.deviceId, element: opts.element ?? 'main' };
    }
    symbols.push(sym);
  };

  // 1) Run-demand rung from the group trigger.
  const demandRung = addRung('Run demand');
  const triggerSym: SchematicSymbolType =
    config.trigger === 'level'
      ? 'level-contact'
      : config.trigger === 'pressure'
        ? 'pressure-contact'
        : config.trigger === 'timer'
          ? 'timer-contact-on'
          : 'pushbutton-no';
  addSym(demandRung, triggerSym, 0, {
    label: PUMP_GROUP_TRIGGERS[config.trigger].label,
    ...(controllerId ? { deviceId: controllerId, element: 'aux-no' } : {}),
  });
  addSym(demandRung, 'coil', 1, { label: 'Demand', ...(controllerId ? { deviceId: controllerId, element: 'coil' } : {}) });

  // 2) Alternator step (alternating schemes): advance the lead each cycle.
  if (alternatorId) {
    const r = addRung('Lead alternation');
    addSym(r, 'no-contact', 0, { label: 'Demand', ...(controllerId ? { deviceId: controllerId, element: 'aux-no' } : {}) });
    addSym(r, 'coil', 1, { label: 'Alt', deviceId: alternatorId, element: 'coil' });
  }

  // 3) One run rung per member with the staging / interlock contacts.
  members.forEach((m, i) => {
    const r = addRung(`Run ${m.name}`);
    let col = 0;
    addSym(r, 'no-contact', col++, { label: 'Demand', ...(controllerId ? { deviceId: controllerId, element: 'aux-no' } : {}) });

    if (modeDef.alternates && alternatorId) {
      // The alternator selects which pump is lead this cycle / which stages next.
      addSym(r, 'no-contact', col++, { label: `Lead ${shortTag(i)}`, deviceId: alternatorId, element: 'aux-no' });
    } else if (modeDef.interlock === 'sequence' && i > 0) {
      // Fixed staging: this pump runs only after the previous one is running.
      const prev = members[i - 1]!;
      addSym(r, 'no-contact', col++, { label: shortTag(i - 1), deviceId: runCoilId(prev), element: 'aux-no' });
    }

    if (modeDef.interlock === 'mutual-exclusion') {
      // Only one member runs at a time: cross-wired NC of the next member.
      const other = members[(i + 1) % members.length]!;
      if (other.circuitId !== m.circuitId) {
        addSym(r, 'nc-contact', col++, { label: shortTag((i + 1) % members.length), deviceId: runCoilId(other), element: 'aux-nc' });
      }
    }

    const ol = overloadId(m);
    if (ol) addSym(r, 'overload-contact', col++, { label: 'OL', deviceId: ol, element: 'aux-nc' });

    addSym(r, 'coil', col, { label: shortTag(i), deviceId: runCoilId(m), element: 'coil' });
  });

  return { circuitId: cid, rungs, symbols, connections: [] };
}

/**
 * Derive the full control package for one pump group from its config and the
 * resolved member pump circuits.
 */
export function computePumpGroup(
  config: PumpGroupConfig,
  members: PumpGroupMember[],
): PumpGroupResult {
  const modeDef = PUMP_GROUP_MODES[config.mode];
  const triggerDef = PUMP_GROUP_TRIGGERS[config.trigger];
  const warnings: string[] = [];

  const devices: AssemblyDevice[] = [];

  // Shared trigger controller (water-level / timer / pressure).
  let controllerId: string | undefined;
  if (triggerDef.controllerCategory) {
    controllerId = `group:${config.id}:controller`;
    const rating =
      config.trigger === 'level'
        ? `${config.sensing ?? DEFAULT_SENSING.duplex} sensing`
        : config.trigger === 'timer'
          ? `${config.timerOnMin ?? 5} min ON / ${config.timerOffMin ?? 10} min OFF`
          : 'PID setpoint';
    devices.push({
      id: controllerId,
      role: triggerDef.controllerRole,
      category: triggerDef.controllerCategory as PartCategory,
      qty: 1,
      rating,
      heatLossW: 1,
      widthMm: 36,
    });
  }

  // Alternator relay for schemes that rotate the lead.
  let alternatorId: string | undefined;
  if (modeDef.alternates) {
    alternatorId = `group:${config.id}:alternator`;
    devices.push({
      id: alternatorId,
      role: 'group-alternator',
      category: 'alternator_relay',
      qty: 1,
      rating: `${members.length}-way duty rotation`,
      heatLossW: 1,
      widthMm: 36,
    });
  }

  // Cross-pump interlocks between the member run coils.
  const interlocks: Interlock[] = [];
  if (modeDef.interlock === 'mutual-exclusion') {
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        interlocks.push({
          id: `group:${config.id}:il-${i}-${j}`,
          kind: 'electrical',
          deviceAId: runCoilId(members[i]!),
          deviceBId: runCoilId(members[j]!),
          relation: 'mutual_exclusion',
          note: `Only one pump of "${config.name}" runs at a time (duty/standby) — cross-wired NC interlock; the alternator rotates which is duty.`,
        });
      }
    }
  } else if (modeDef.interlock === 'sequence') {
    for (let i = 1; i < members.length; i++) {
      interlocks.push({
        id: `group:${config.id}:il-seq-${i}`,
        kind: 'electrical',
        deviceAId: runCoilId(members[i - 1]!),
        deviceBId: runCoilId(members[i]!),
        relation: 'sequence',
        note: `"${members[i]!.name}" stages in only after "${members[i - 1]!.name}" is running (assist on rising demand).`,
      });
    }
  }

  // Validation.
  if (members.length < modeDef.minPumps) {
    warnings.push(
      `"${config.name}" (${modeDef.label}) needs at least ${modeDef.minPumps} pumps — assign more member pumps.`,
    );
  }
  const noStarter = members.filter((m) => !m.control);
  for (const m of noStarter) {
    warnings.push(`Pump "${m.name}" has no motor starter, so it cannot be controlled in group "${config.name}" — set a starter on it.`);
  }

  const schematic = buildGroupSchematic(config, members, controllerId, alternatorId);

  const note = `${members.length} pump(s) as ${modeDef.label}, started by a ${triggerDef.label.toLowerCase()}. ${modeDef.description}`;

  return {
    id: config.id,
    name: config.name,
    mode: config.mode,
    trigger: config.trigger,
    memberCircuitIds: members.map((m) => m.circuitId),
    memberNames: members.map((m) => m.name),
    devices,
    interlocks,
    schematic,
    warnings,
    note,
  };
}
