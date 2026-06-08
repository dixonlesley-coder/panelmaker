import type { SchematicSymbolType } from '@shared/types';

const BLUE = 'var(--mantine-color-indigo-6)';
const RED = 'var(--mantine-color-red-6)';
const ORANGE = 'var(--mantine-color-orange-6)';
const GREEN = 'var(--mantine-color-teal-6)';

/**
 * A small, recognizable IEC-style ladder glyph drawn in SVG. Every glyph has a
 * horizontal wire at its vertical centre (so symbols wire together cleanly) with
 * the device element rendered in the middle.
 */
export function LadderSymbol({ type, width = 60 }: { type: SchematicSymbolType; width?: number }) {
  const h = 34;
  const mid = h / 2;
  const cx = width / 2;
  const stroke = 'currentColor';

  // left + right wire stubs up to the central element (half-width 12)
  const wires = (
    <>
      <line x1={0} y1={mid} x2={cx - 12} y2={mid} stroke={stroke} strokeWidth={1.5} />
      <line x1={cx + 12} y1={mid} x2={width} y2={mid} stroke={stroke} strokeWidth={1.5} />
    </>
  );

  let element: React.ReactNode = null;

  switch (type) {
    case 'no-contact':
    case 'level-contact':
    case 'pressure-contact': {
      const tag = type === 'level-contact' ? 'L' : type === 'pressure-contact' ? 'P' : '';
      element = (
        <>
          <line x1={cx - 6} y1={mid - 9} x2={cx - 6} y2={mid + 9} stroke={stroke} strokeWidth={2} />
          <line x1={cx + 6} y1={mid - 9} x2={cx + 6} y2={mid + 9} stroke={stroke} strokeWidth={2} />
          {tag && (
            <text x={cx} y={mid - 12} textAnchor="middle" fontSize={9} fill={stroke}>
              {tag}
            </text>
          )}
        </>
      );
      break;
    }
    case 'nc-contact':
    case 'overload-contact': {
      const color = type === 'overload-contact' ? ORANGE : stroke;
      element = (
        <>
          <line x1={cx - 6} y1={mid - 9} x2={cx - 6} y2={mid + 9} stroke={color} strokeWidth={2} />
          <line x1={cx + 6} y1={mid - 9} x2={cx + 6} y2={mid + 9} stroke={color} strokeWidth={2} />
          <line x1={cx - 9} y1={mid + 9} x2={cx + 9} y2={mid - 9} stroke={color} strokeWidth={2} />
        </>
      );
      break;
    }
    case 'pushbutton-no':
    case 'pushbutton-nc': {
      const nc = type === 'pushbutton-nc';
      element = (
        <>
          <line x1={cx - 6} y1={mid - 7} x2={cx - 6} y2={mid + 7} stroke={stroke} strokeWidth={2} />
          <line x1={cx + 6} y1={mid - 7} x2={cx + 6} y2={mid + 7} stroke={stroke} strokeWidth={2} />
          {nc && <line x1={cx - 9} y1={mid + 7} x2={cx + 9} y2={mid - 7} stroke={stroke} strokeWidth={2} />}
          {/* button cap */}
          <line x1={cx} y1={mid - 7} x2={cx} y2={mid - 13} stroke={stroke} strokeWidth={1.5} />
          <rect x={cx - 5} y={mid - 16} width={10} height={3} rx={1} fill={stroke} />
        </>
      );
      break;
    }
    case 'estop': {
      element = (
        <>
          <circle cx={cx} cy={mid} r={9} fill={RED} />
          <rect x={cx - 6} y={mid - 1.5} width={12} height={3} rx={1} fill="white" />
        </>
      );
      break;
    }
    case 'coil':
    case 'timer-coil-on': {
      element = (
        <>
          <path d={`M ${cx - 10} ${mid - 9} A 9 9 0 0 0 ${cx - 10} ${mid + 9}`} fill="none" stroke={BLUE} strokeWidth={2} />
          <path d={`M ${cx + 10} ${mid - 9} A 9 9 0 0 1 ${cx + 10} ${mid + 9}`} fill="none" stroke={BLUE} strokeWidth={2} />
          {type === 'timer-coil-on' && (
            <text x={cx} y={mid + 4} textAnchor="middle" fontSize={10} fontWeight={700} fill={BLUE}>
              T
            </text>
          )}
        </>
      );
      break;
    }
    case 'timer-contact-on': {
      element = (
        <>
          <line x1={cx - 6} y1={mid - 9} x2={cx - 6} y2={mid + 9} stroke={stroke} strokeWidth={2} />
          <line x1={cx + 6} y1={mid - 9} x2={cx + 6} y2={mid + 9} stroke={stroke} strokeWidth={2} />
          <text x={cx} y={mid - 12} textAnchor="middle" fontSize={9} fontWeight={700} fill={stroke}>
            T
          </text>
        </>
      );
      break;
    }
    case 'lamp': {
      element = (
        <>
          <circle cx={cx} cy={mid} r={9} fill="none" stroke={GREEN} strokeWidth={2} />
          <line x1={cx - 6} y1={mid - 6} x2={cx + 6} y2={mid + 6} stroke={GREEN} strokeWidth={1.5} />
          <line x1={cx - 6} y1={mid + 6} x2={cx + 6} y2={mid - 6} stroke={GREEN} strokeWidth={1.5} />
        </>
      );
      break;
    }
    default:
      element = null;
  }

  return (
    <svg width={width} height={h} style={{ display: 'block', color: 'var(--mantine-color-text)' }}>
      {wires}
      {element}
    </svg>
  );
}
