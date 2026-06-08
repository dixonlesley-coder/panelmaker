import type {
  ControlAssembly,
  ControlSchematic,
  SchematicRung,
  SchematicSymbol,
  SchematicSymbolType,
  DeviceElement,
} from '../../types';

/**
 * Generate a standard control/ladder schematic for a sized control assembly.
 * Produces the canonical start/stop + coil rungs for the starter type, including
 * the cross-interlock NC contacts that make star-delta / reversing / ATS safe,
 * plus pump auto-control and run-indication rungs. Every element is flagged
 * `generated` and references its power-side device by id.
 */
export function buildSchematic(assembly: ControlAssembly): ControlSchematic {
  const cid = assembly.circuitId;
  const roleId = new Map(assembly.devices.map((d) => [d.role, d.id]));
  const has = (role: string) => roleId.has(role);
  const dev = (role: string) => roleId.get(role) ?? `${cid}:${role}`;

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
    opts: { label?: string; branch?: number; deviceId?: string; element?: DeviceElement } = {},
  ): void => {
    const sym: SchematicSymbol = {
      id: `${cid}:s${symSeq++}`,
      rungId,
      type,
      col,
      branch: opts.branch ?? 0,
      generated: true,
    };
    if (opts.label !== undefined) sym.label = opts.label;
    if (opts.deviceId !== undefined) {
      sym.deviceRef = { deviceId: opts.deviceId, element: opts.element ?? 'main' };
    }
    symbols.push(sym);
  };

  const hasOverload = has('overload');

  /** A standard start/stop coil rung with seal-in, optional overload, optional interlock. */
  const startStopCoil = (
    label: string,
    coilRole: string,
    coilLabel: string,
    opts: { interlockNcRole?: string; interlockLabel?: string } = {},
  ): void => {
    const r = addRung(label);
    let col = 0;
    addSym(r, 'pushbutton-nc', col++, { label: 'Stop' });
    addSym(r, 'pushbutton-no', col, { label: 'Start' });
    addSym(r, 'no-contact', col++, { label: coilLabel, branch: 1, deviceId: dev(coilRole), element: 'aux-no' });
    if (opts.interlockNcRole) {
      addSym(r, 'nc-contact', col++, {
        label: opts.interlockLabel,
        deviceId: dev(opts.interlockNcRole),
        element: 'aux-nc',
      });
    }
    if (hasOverload) {
      addSym(r, 'overload-contact', col++, { label: 'OL', deviceId: dev('overload'), element: 'aux-nc' });
    }
    addSym(r, 'coil', col, { label: coilLabel, deviceId: dev(coilRole), element: 'coil' });
  };

  const runLamp = (coilRole: string, coilLabel: string): void => {
    const r = addRung('Run indication');
    addSym(r, 'no-contact', 0, { label: coilLabel, deviceId: dev(coilRole), element: 'aux-no' });
    addSym(r, 'lamp', 1, { label: 'RUN' });
  };

  switch (assembly.starterType) {
    case 'STAR_DELTA': {
      startStopCoil('Main contactor', 'main-contactor', 'KM1');
      // Star energised first (delta interlock), dropped by timer
      {
        const r = addRung('Star (start)');
        addSym(r, 'no-contact', 0, { label: 'KM1', deviceId: dev('main-contactor'), element: 'aux-no' });
        addSym(r, 'timer-contact-on', 1, { label: 'KT', deviceId: dev('star-delta-timer'), element: 'aux-nc' });
        addSym(r, 'nc-contact', 2, { label: 'KM3', deviceId: dev('delta-contactor'), element: 'aux-nc' });
        addSym(r, 'coil', 3, { label: 'KM2', deviceId: dev('star-contactor'), element: 'coil' });
      }
      {
        const r = addRung('Delta (run)');
        addSym(r, 'no-contact', 0, { label: 'KM1', deviceId: dev('main-contactor'), element: 'aux-no' });
        addSym(r, 'timer-contact-on', 1, { label: 'KT', deviceId: dev('star-delta-timer'), element: 'aux-no' });
        addSym(r, 'nc-contact', 2, { label: 'KM2', deviceId: dev('star-contactor'), element: 'aux-nc' });
        addSym(r, 'coil', 3, { label: 'KM3', deviceId: dev('delta-contactor'), element: 'coil' });
      }
      runLamp('main-contactor', 'KM1');
      break;
    }
    case 'REVERSING': {
      startStopCoil('Forward', 'forward-contactor', 'KMF', {
        interlockNcRole: 'reverse-contactor',
        interlockLabel: 'KMR',
      });
      startStopCoil('Reverse', 'reverse-contactor', 'KMR', {
        interlockNcRole: 'forward-contactor',
        interlockLabel: 'KMF',
      });
      break;
    }
    case 'ATS': {
      startStopCoil('Mains source', 'mains-contactor', 'KM-M', {
        interlockNcRole: 'genset-contactor',
        interlockLabel: 'KM-G',
      });
      startStopCoil('Genset source', 'genset-contactor', 'KM-G', {
        interlockNcRole: 'mains-contactor',
        interlockLabel: 'KM-M',
      });
      break;
    }
    case 'VFD': {
      const r = addRung('Drive run/stop');
      addSym(r, 'pushbutton-nc', 0, { label: 'Stop' });
      addSym(r, 'pushbutton-no', 1, { label: 'Start' });
      addSym(r, 'coil', 2, { label: 'RUN', deviceId: dev('drive'), element: 'coil' });
      runLamp('drive', 'RUN');
      break;
    }
    case 'SOFT_STARTER': {
      startStopCoil('Soft starter run', 'bypass-contactor', 'KM');
      runLamp('bypass-contactor', 'KM');
      break;
    }
    case 'DOL':
    default: {
      startStopCoil('Motor start/stop', 'main-contactor', 'K1');
      runLamp('main-contactor', 'K1');
      break;
    }
  }

  // Pump / level auto-control overlay
  if (assembly.pump) {
    const r = addRung(`Auto (${assembly.pump.mode}) level control`);
    const sensorType: SchematicSymbolType =
      assembly.pump.sensing === 'pressure' ? 'pressure-contact' : 'level-contact';
    addSym(r, sensorType, 0, { label: assembly.pump.mode === 'drain' ? 'High' : 'Low' });
    if (assembly.pump.mode === 'fill') {
      addSym(r, 'nc-contact', 1, { label: 'Dry-run' });
    }
    const coilRole = has('main-contactor') ? 'main-contactor' : has('bypass-contactor') ? 'bypass-contactor' : 'drive';
    addSym(r, 'coil', 2, { label: 'Auto', deviceId: dev(coilRole), element: 'coil' });
  }

  return { circuitId: cid, rungs, symbols, connections: [] };
}
