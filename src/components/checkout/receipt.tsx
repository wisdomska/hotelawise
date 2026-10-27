// The dotted-leader receipt used across checkout (Checkout.dc.html › receipt).
export type ReceiptLine = { label: string; amount: string; color?: string; weight?: number };

const leader: React.CSSProperties = {
  flex: 1,
  borderBottom: '1.5px dotted rgba(0,0,58,0.35)',
  margin: '0 8px',
  transform: 'translateY(-4px)',
};

export function Receipt({ lines, children }: { lines: ReceiptLine[]; children?: React.ReactNode }) {
  return (
    <div
      style={{
        borderTop: '1.5px dashed rgba(0,0,99,0.3)',
        paddingTop: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        fontFamily: 'var(--font-mono)',
        fontSize: 13,
      }}
    >
      {lines.map((l, i) => (
        <div key={`${l.label}-${i}`} style={{ display: 'flex', alignItems: 'baseline', color: l.color, fontWeight: l.weight }}>
          <span>{l.label}</span>
          <span style={leader} />
          <span>{l.amount}</span>
        </div>
      ))}
      {children}
    </div>
  );
}

export function ReceiptTotal({
  label,
  amount,
  size = 16,
  top = true,
  color,
}: {
  label: string;
  amount: string;
  size?: number;
  top?: boolean;
  color?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        fontSize: size,
        fontWeight: top ? 500 : 400,
        paddingTop: top ? 8 : 0,
        marginTop: top ? 4 : 0,
        borderTop: top ? '1px solid rgba(0,0,99,0.2)' : undefined,
        color,
      }}
    >
      <span>{label}</span>
      <span style={{ flex: 1 }} />
      <span>{amount}</span>
    </div>
  );
}
