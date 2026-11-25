/**
 * Minigráfica de barras de 12 meses para las tarjetas de cifras (SVG, sin
 * JavaScript). El mes elegido va en color pleno y el resto atenuado; los
 * negativos bajan de la línea base. Cada barra dice su mes y valor al pasar
 * por encima (title) y la etiqueta del conjunto resume la serie.
 */
export function MiniBars({
  points,
  color,
  label,
  format,
}: {
  points: { title: string; value: number | null }[];
  /** Color CSS de la serie (var(--series-…)). */
  color: string;
  label: string;
  format: (v: number) => string;
}) {
  const vals = points.map((p) => p.value ?? 0);
  const max = Math.max(0, ...vals);
  const min = Math.min(0, ...vals);
  const span = max - min || 1;
  const W = 120;
  const H = 28;
  const gap = 2;
  const bw = (W - gap * (points.length - 1)) / points.length;
  const zero = (max / span) * H;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-7 w-full overflow-visible" role="img" aria-label={label}>
      <line x1={0} x2={W} y1={zero} y2={zero} stroke="var(--border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      {points.map((p, i) => {
        const v = p.value ?? 0;
        const h = Math.max((Math.abs(v) / span) * H, v !== 0 ? 1.5 : 0);
        const y = v >= 0 ? zero - h : zero;
        const last = i === points.length - 1;
        return (
          <rect
            key={i}
            x={i * (bw + gap)}
            y={y}
            width={bw}
            height={h}
            rx={1.5}
            fill={color}
            opacity={last ? 1 : 0.32}
            className="fc-grow-y"
            style={{ "--i": i, transformOrigin: v >= 0 ? "bottom" : "top" } as React.CSSProperties}
          >
            <title>{`${p.title}: ${p.value === null ? "sin dato" : format(p.value)}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}
