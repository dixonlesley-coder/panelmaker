import { starterTemplate } from '../../standards/control/starters';
import { coilBurdenForFrame } from '../../standards/control/controlGear';
import { type2SetFor } from '../../standards/control/coordination';
import type {
  AssemblyDevice,
  ControlAssembly,
  Interlock,
  PartCategory,
  StarterType,
  StartingDuty,
} from '../../types';
import { round } from '../util';
import { motorFLC } from './motorFLC';
import { startingAnalysis } from './startingAnalysis';
import { selectContactor } from './selectContactor';
import { selectOverload } from './selectOverload';
import { selectVFD } from './selectVFD';
import { sizeControlTransformer } from './sizeControlTransformer';

export interface ApplyStarterInput {
  circuitId: string;
  starterType: StarterType;
  motorKw: number;
  motorPoles?: number;
  voltageV?: number;
  startingDuty?: StartingDuty;
  /** Variable-torque load (pump/fan) — affects VSD energy-saving note. */
  variableTorque?: boolean;
}

function contactorWidth(ac3A: number): number {
  if (ac3A <= 40) return 45;
  if (ac3A <= 115) return 55;
  if (ac3A <= 300) return 105;
  return 160;
}

function pilotWidth(category: PartCategory): number {
  if (category === 'timer_relay' || category === 'control_relay') return 36;
  if (category === 'vfd' || category === 'soft_starter') return 90;
  if (category === 'breaker') return 54;
  return 22;
}

/**
 * Interpret a starter template for a motor circuit: size each gear slot and
 * resolve the interlock specs into concrete interlocks referencing the
 * instantiated device ids. Pure and fully fixture-testable.
 */
export function applyStarterTemplate(input: ApplyStarterInput): ControlAssembly {
  const {
    circuitId,
    starterType,
    motorKw,
    motorPoles = 4,
    voltageV = 400,
    startingDuty = 'normal',
  } = input;

  const flcA = round(motorFLC(motorKw, voltageV), 1);
  const def = starterTemplate(starterType);
  const warnings: string[] = [];
  const starting = startingAnalysis(starterType, flcA, input.variableTorque);

  if (!def) {
    return {
      circuitId,
      starterType,
      motor: { kw: motorKw, flcA, poles: motorPoles },
      devices: [],
      interlocks: [],
      starting,
      warnings: [`Unknown starter type: ${starterType}`],
    };
  }

  const roleToId = new Map<string, string>();

  const devices: AssemblyDevice[] = def.deviceSlots.map((slot) => {
    const id = `${circuitId}:${slot.role}`;
    roleToId.set(slot.role, id);
    const base: AssemblyDevice = {
      id,
      role: slot.role,
      category: slot.category,
      qty: slot.qty ?? 1,
    };

    switch (slot.sizing) {
      case 'ac3-full-flc': {
        const sel = selectContactor({ flcA, startingDuty });
        if (!sel.ok) warnings.push(`No contactor frame covers ${sel.targetA} A for ${slot.role}`);
        return {
          ...base,
          targetRatingA: sel.targetA,
          rating: `${sel.ac3A} A AC-3 (${sel.kw400} kW)`,
          heatLossW: sel.heatLossW,
          widthMm: contactorWidth(sel.ac3A),
        };
      }
      case 'ac3-star-winding': {
        const sel = selectContactor({ flcA, isStarWinding: true, startingDuty });
        return {
          ...base,
          targetRatingA: sel.targetA,
          rating: `${sel.ac3A} A AC-3 (star, 58% FLC)`,
          heatLossW: sel.heatLossW,
          widthMm: contactorWidth(sel.ac3A),
        };
      }
      case 'overload-flc': {
        const ol = selectOverload({ flcA, startingDuty });
        return {
          ...base,
          targetRatingA: ol.settingA,
          rating: `set ${ol.settingA} A, class ${ol.tripClass}`,
          heatLossW: 0.5,
          widthMm: 45,
        };
      }
      case 'overload-star-flc': {
        const ol = selectOverload({ flcA, inStarLeg: true, startingDuty });
        return {
          ...base,
          targetRatingA: ol.settingA,
          rating: `set ${ol.settingA} A (delta leg), class ${ol.tripClass}`,
          heatLossW: 0.5,
          widthMm: 45,
        };
      }
      case 'vfd-output': {
        const v = selectVFD({ flcA, torqueType: 'variable' });
        if (!v.ok) warnings.push(`No drive covers ${v.requiredA} A for ${slot.role}`);
        return {
          ...base,
          targetRatingA: v.requiredA,
          rating: `${v.ratedKw} kW / ${v.outputA} A`,
          heatLossW: v.heatLossW,
          widthMm: 90,
        };
      }
      default:
        return { ...base, rating: '-', heatLossW: 0, widthMm: pilotWidth(slot.category) };
    }
  });

  if (def.controlTransformerRequired) {
    const burdens = devices
      .filter((d) => d.category === 'contactor' && d.targetRatingA !== undefined)
      .map((d) => coilBurdenForFrame(d.targetRatingA ?? 0));
    const tx = sizeControlTransformer({ burdens, pilotSealedVA: 10 });
    const id = `${circuitId}:control-transformer`;
    roleToId.set('control-transformer', id);
    devices.push({
      id,
      role: 'control-transformer',
      category: 'control_transformer',
      qty: 1,
      rating: `${tx.chosenVA} VA`,
      heatLossW: round(tx.chosenVA * 0.03, 1),
      widthMm: 70,
    });
    if (!tx.ok) warnings.push('Control transformer VA exceeds largest standard size');
  }

  const interlocks: Interlock[] = def.interlocks.map((spec, i) => ({
    id: `${circuitId}:il${i}`,
    kind: spec.kind,
    deviceAId: roleToId.get(spec.roleA) ?? spec.roleA,
    deviceBId: roleToId.get(spec.roleB) ?? spec.roleB,
    relation: spec.relation,
    note: spec.note,
  }));

  // Type-2 coordination (IEC 60947-4-1): attach the verified DOL combination
  // covering this motor for contactor-based starters. Independently sized
  // devices are only a starting point — after a short circuit a type-2 set must
  // remain serviceable, which only a tested combination guarantees.
  let coordination: ControlAssembly['coordination'];
  const contactorBased =
    starterType === 'DOL' ||
    starterType === 'STAR_DELTA' ||
    starterType === 'REVERSING' ||
    starterType === 'PUMP';
  if (contactorBased) {
    const set = type2SetFor(motorKw);
    if (set) {
      const mainContactor = devices.find(
        (d) => d.category === 'contactor' && d.targetRatingA !== undefined,
      );
      const contactorMatches =
        mainContactor?.targetRatingA === undefined ||
        mainContactor.targetRatingA + 1e-9 >= Math.min(set.contactorAc3A, flcA);
      coordination = {
        breakerA: set.breakerA,
        contactorAc3A: set.contactorAc3A,
        olRangeA: set.olRangeA,
        contactorMatches,
        note: `Type-2 verified set (${set.kw} kW DOL basis): breaker ${set.breakerA} A + contactor ${set.contactorAc3A} A AC-3 + OL ${set.olRangeA[0]}–${set.olRangeA[1]} A — confirm against the chosen manufacturer's coordination table.`,
      };
      if (!contactorMatches) {
        warnings.push(
          `Contactor below the type-2 verified set (${set.contactorAc3A} A AC-3) for ${motorKw} kW — the combination may weld under short-circuit (IEC 60947-4-1 type 2).`,
        );
      }
    }
  }

  return {
    circuitId,
    starterType,
    motor: { kw: motorKw, flcA, poles: motorPoles },
    devices,
    interlocks,
    starting,
    ...(coordination ? { coordination } : {}),
    warnings,
  };
}
