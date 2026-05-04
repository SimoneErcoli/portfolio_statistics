import { formatCompactCurrency, formatDateLabel } from "../lib/portfolio";

function buildLinePath(data, width, height, padding, minValue, maxValue, accessor) {
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const range = maxValue - minValue || 1;

  return data
    .map((point, index) => {
      const x =
        data.length === 1
          ? width / 2
          : padding + (chartWidth * index) / (data.length - 1);
      const y = padding + ((maxValue - accessor(point)) / range) * chartHeight;

      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function buildAreaPath(data, width, height, padding, minValue, maxValue, accessor) {
  const linePath = buildLinePath(data, width, height, padding, minValue, maxValue, accessor);
  const chartWidth = width - padding * 2;
  const baseY = height - padding;
  const lastX = data.length === 1 ? width / 2 : padding + chartWidth;

  return `${linePath} L ${lastX.toFixed(2)} ${baseY.toFixed(2)} L ${padding.toFixed(
    2
  )} ${baseY.toFixed(2)} Z`;
}

export function PerformanceChart({ data, currency }) {
  if (!data.length) {
    return null;
  }

  const width = 860;
  const height = 340;
  const padding = 26;
  const allValues = data.flatMap((point) => [point.wealth, point.netContributions]);
  const minValue = Math.min(...allValues, 0);
  const maxValue = Math.max(...allValues);
  const primaryLine = buildLinePath(
    data,
    width,
    height,
    padding,
    minValue,
    maxValue,
    (point) => point.wealth
  );
  const secondaryLine = buildLinePath(
    data,
    width,
    height,
    padding,
    minValue,
    maxValue,
    (point) => point.netContributions
  );
  const areaPath = buildAreaPath(
    data,
    width,
    height,
    padding,
    minValue,
    maxValue,
    (point) => point.wealth
  );
  const axisValues = [maxValue, minValue + (maxValue - minValue) / 2, minValue];

  return (
    <div className="chart-shell">
      <div className="chart-frame">
        <svg
          className="chart-svg"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Andamento della ricchezza del portafoglio e dei contributi netti"
        >
          <defs>
            <linearGradient id="wealth-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgba(15, 118, 110, 0.32)" />
              <stop offset="100%" stopColor="rgba(15, 118, 110, 0.03)" />
            </linearGradient>
          </defs>

          {axisValues.map((value, index) => {
            const range = maxValue - minValue || 1;
            const y = padding + ((maxValue - value) / range) * (height - padding * 2);

            return (
              <g key={`${value}-${index}`}>
                <line className="chart-grid-line" x1={padding} x2={width - padding} y1={y} y2={y} />
                <text className="chart-axis-label" x={padding + 4} y={Math.max(18, y - 8)}>
                  {formatCompactCurrency(value, currency)}
                </text>
              </g>
            );
          })}

          <path className="chart-area" d={areaPath} fill="url(#wealth-fill)" />
          <path className="chart-secondary-line" d={secondaryLine} />
          <path className="chart-primary-line" d={primaryLine} />
        </svg>
      </div>

      <div className="chart-foot">
        <span>Inizio serie: {formatDateLabel(data[0].date)}</span>
        <span>Ultimo dato: {formatDateLabel(data[data.length - 1].date)}</span>
      </div>
    </div>
  );
}
