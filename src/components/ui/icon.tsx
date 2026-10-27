// The prototype's <aw-icon>: line icons, brand marks and Ghana MoMo network tiles.
import { BRAND_MARKS, ICON_PATHS, type BrandName, type IconName } from './icon-paths';

type MomoNetwork = 'mtn' | 'telecel' | 'airteltigo';
export type AnyIconName = IconName | BrandName | MomoNetwork;

type Props = { name: AnyIconName; size?: number; stroke?: number; color?: string; className?: string; style?: React.CSSProperties };

const TILE: Record<MomoNetwork, { bg: string; border?: boolean }> = {
  mtn: { bg: '#FFCB05' },
  telecel: { bg: '#E30613' },
  airteltigo: { bg: '#FFFFFF', border: true },
};

function MomoTile({ name, size }: { name: MomoNetwork; size: number }) {
  const t = TILE[name];
  const text =
    name === 'mtn' ? (
      <b style={{ font: `800 italic ${size * 0.34}px/1 Arial,sans-serif`, color: '#000', letterSpacing: '-0.02em' }}>MTN</b>
    ) : name === 'telecel' ? (
      <b style={{ font: `700 ${size * 0.24}px/1 Arial,sans-serif`, color: '#fff', letterSpacing: '-0.02em' }}>telecel</b>
    ) : (
      <b style={{ font: `800 ${size * 0.36}px/1 Arial,sans-serif`, letterSpacing: '-0.03em' }}>
        <span style={{ color: '#E40000' }}>a</span>
        <span style={{ color: '#0033A0' }}>t</span>
      </b>
    );
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.24),
        background: t.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: t.border ? 'inset 0 0 0 1px rgba(0,0,0,0.12)' : undefined,
      }}
    >
      {text}
    </span>
  );
}

export function Icon({ name, size = 20, stroke = 1.75, color, className, style }: Props) {
  const box: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: size,
    height: size,
    lineHeight: 0,
    ...style,
  };
  if (name === 'mtn' || name === 'telecel' || name === 'airteltigo') {
    return (
      <span aria-hidden="true" className={className} style={box}>
        <MomoTile name={name} size={size} />
      </span>
    );
  }
  if (name in BRAND_MARKS) {
    const b = BRAND_MARKS[name as BrandName];
    return (
      <span aria-hidden="true" className={className} style={box}>
        <svg viewBox="0 0 24 24" width={size} height={size} fill={color ?? b.fill} style={{ display: 'block' }}>
          <path d={b.d} />
        </svg>
      </span>
    );
  }
  return (
    <span aria-hidden="true" className={className} style={box}>
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ display: 'block' }}
        // Static path data from the prototype icon set (no user input).
        dangerouslySetInnerHTML={{ __html: ICON_PATHS[name as IconName] }}
      />
    </span>
  );
}
