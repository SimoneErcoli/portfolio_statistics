import { formatCompactCurrency, formatDateLabel, formatPercent } from "@/lib/portfolio";

const WIDE_CHART_WIDTH = 860;
const WIDE_CHART_HEIGHT = 340;
const NARROW_CHART_WIDTH = 520;
const NARROW_CHART_HEIGHT = 360;
const CHART_PADDING = 26;
const ETF_SERIES_COLORS = [
  "#11283f",
  "#0f766e",
  "#d97706",
  "#b45309",
  "#1d4ed8",
  "#0a7a45",
  "#be123c",
  "#7c3aed"
];

function toTimestamp(date) {
  return new Date(`${date}T00:00:00Z`).getTime();
}

function createDateScale(seriesList, width, padding) {
  const timestamps = seriesList.flatMap((series) => series.map((point) => toTimestamp(point.date)));
  const minTimestamp = Math.min(...timestamps);
  const maxTimestamp = Math.max(...timestamps);
  const chartWidth = width - padding * 2;
  const range = maxTimestamp - minTimestamp || 1;

  return {
    toX(date) {
      if (maxTimestamp === minTimestamp) {
        return width / 2;
      }

      return padding + ((toTimestamp(date) - minTimestamp) / range) * chartWidth;
    }
  };
}

function createXScale(minValue, maxValue, width, padding) {
  const chartWidth = width - padding * 2;
  const range = maxValue - minValue || 1;

  return (value) => padding + ((value - minValue) / range) * chartWidth;
}

function createYScale(minValue, maxValue, height, padding) {
  const chartHeight = height - padding * 2;
  const range = maxValue - minValue || 1;

  return (value) => padding + ((maxValue - value) / range) * chartHeight;
}

function buildLinePath(points, getX, getY) {
  if (!points.length) {
    return "";
  }

  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${getX(point).toFixed(2)} ${getY(point).toFixed(2)}`)
    .join(" ");
}

function buildAreaPath(points, getX, getY, baseY) {
  if (!points.length) {
    return "";
  }

  const firstX = getX(points[0]);
  const lastX = getX(points[points.length - 1]);

  return `${buildLinePath(points, getX, getY)} L ${lastX.toFixed(2)} ${baseY.toFixed(
    2
  )} L ${firstX.toFixed(2)} ${baseY.toFixed(2)} Z`;
}

function buildAxisValues(minValue, maxValue, steps = 3) {
  if (steps <= 1 || minValue === maxValue) {
    return [maxValue, minValue];
  }

  return Array.from(
    { length: steps },
    (_, index) => maxValue - ((maxValue - minValue) * index) / (steps - 1)
  );
}

function buildAscendingAxisValues(minValue, maxValue, steps = 3) {
  return buildAxisValues(minValue, maxValue, steps).reverse();
}

function DateChartFoot({ data, extra }) {
  if (!data.length) {
    return null;
  }

  return (
    <div className="chart-foot">
      <span>Inizio serie: {formatDateLabel(data[0].date)}</span>
      <span>Ultimo dato: {formatDateLabel(data[data.length - 1].date)}</span>
      {extra ? <span>{extra}</span> : null}
    </div>
  );
}

function ScatterChartFoot({ left, right, extra }) {
  return (
    <div className="chart-foot">
      <span>{left}</span>
      <span>{right}</span>
      {extra ? <span>{extra}</span> : null}
    </div>
  );
}

export function PerformanceChart({ data, currency }) {
  if (!data.length) {
    return null;
  }

  const allValues = data.flatMap((point) => [point.wealth, point.netContributions]);
  const minValue = Math.min(...allValues, 0);
  const maxValue = Math.max(...allValues, 0);
  const dateScale = createDateScale([data], WIDE_CHART_WIDTH, CHART_PADDING);
  const yScale = createYScale(minValue, maxValue, WIDE_CHART_HEIGHT, CHART_PADDING);
  const getX = (point) => dateScale.toX(point.date);
  const wealthLine = buildLinePath(data, getX, (point) => yScale(point.wealth));
  const contributionsLine = buildLinePath(data, getX, (point) => yScale(point.netContributions));
  const wealthArea = buildAreaPath(
    data,
    getX,
    (point) => yScale(point.wealth),
    WIDE_CHART_HEIGHT - CHART_PADDING
  );
  const axisValues = buildAxisValues(minValue, maxValue);

  return (
    <div className="chart-shell">
      <div className="chart-frame">
        <svg
          className="chart-svg"
          viewBox={`0 0 ${WIDE_CHART_WIDTH} ${WIDE_CHART_HEIGHT}`}
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
            const y = yScale(value);

            return (
              <g key={`${value}-${index}`}>
                <line
                  className="chart-grid-line"
                  x1={CHART_PADDING}
                  x2={WIDE_CHART_WIDTH - CHART_PADDING}
                  y1={y}
                  y2={y}
                />
                <text className="chart-axis-label" x={CHART_PADDING + 4} y={Math.max(18, y - 8)}>
                  {formatCompactCurrency(value, currency)}
                </text>
              </g>
            );
          })}

          <path className="chart-area" d={wealthArea} fill="url(#wealth-fill)" />
          <path className="chart-secondary-line" d={contributionsLine} />
          <path className="chart-primary-line" d={wealthLine} />
        </svg>
      </div>

      <DateChartFoot data={data} />
    </div>
  );
}

export function DrawdownChart({ data }) {
  if (!data.length) {
    return null;
  }

  const drawdownSeries = data.map((point) => ({
    date: point.date,
    value: -point.drawdown
  }));
  const minValue = Math.min(...drawdownSeries.map((point) => point.value), -0.001);
  const maxValue = 0;
  const dateScale = createDateScale([drawdownSeries], WIDE_CHART_WIDTH, CHART_PADDING);
  const yScale = createYScale(minValue, maxValue, WIDE_CHART_HEIGHT, CHART_PADDING);
  const getX = (point) => dateScale.toX(point.date);
  const getY = (point) => yScale(point.value);
  const linePath = buildLinePath(drawdownSeries, getX, getY);
  const areaPath = buildAreaPath(drawdownSeries, getX, getY, yScale(0));
  const axisValues = [0, minValue / 2, minValue];

  return (
    <div className="chart-shell">
      <div className="chart-frame">
        <svg
          className="chart-svg"
          viewBox={`0 0 ${WIDE_CHART_WIDTH} ${WIDE_CHART_HEIGHT}`}
          role="img"
          aria-label="Drawdown del portafoglio nel tempo"
        >
          <defs>
            <linearGradient id="drawdown-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgba(180, 35, 24, 0.08)" />
              <stop offset="100%" stopColor="rgba(180, 35, 24, 0.36)" />
            </linearGradient>
          </defs>

          {axisValues.map((value, index) => {
            const y = yScale(value);

            return (
              <g key={`${value}-${index}`}>
                <line
                  className="chart-grid-line"
                  x1={CHART_PADDING}
                  x2={WIDE_CHART_WIDTH - CHART_PADDING}
                  y1={y}
                  y2={y}
                />
                <text className="chart-axis-label" x={CHART_PADDING + 4} y={Math.max(18, y - 8)}>
                  {formatPercent(value)}
                </text>
              </g>
            );
          })}

          <line
            className="chart-zero-line"
            x1={CHART_PADDING}
            x2={WIDE_CHART_WIDTH - CHART_PADDING}
            y1={yScale(0)}
            y2={yScale(0)}
          />
          <path className="chart-area" d={areaPath} fill="url(#drawdown-fill)" />
          <path className="chart-drawdown-line" d={linePath} />
        </svg>
      </div>

      <DateChartFoot
        data={data}
        extra={`Peggior drawdown: ${formatPercent(-Math.max(...data.map((point) => point.drawdown), 0))}`}
      />
    </div>
  );
}

export function EtfComparisonChart({ etfs }) {
  const visibleEtfs = etfs.filter((etf) => etf.history.length > 0).slice(0, 8);

  if (!visibleEtfs.length) {
    return null;
  }

  const series = visibleEtfs.map((etf, index) => ({
    id: etf.id,
    ticker: etf.ticker,
    color: ETF_SERIES_COLORS[index % ETF_SERIES_COLORS.length],
    points: etf.history.map((point) => ({
      date: point.date,
      value: point.cumulativeGrowth
    }))
  }));
  const allPoints = series.flatMap((entry) => entry.points);
  const minValue = Math.min(...allPoints.map((point) => point.value), 0);
  const maxValue = Math.max(...allPoints.map((point) => point.value), 0);
  const dateScale = createDateScale(series.map((entry) => entry.points), WIDE_CHART_WIDTH, CHART_PADDING);
  const yScale = createYScale(minValue, maxValue, WIDE_CHART_HEIGHT, CHART_PADDING);
  const getX = (point) => dateScale.toX(point.date);
  const axisValues = buildAxisValues(minValue, maxValue, 4);
  const hiddenSeriesCount = Math.max(0, etfs.filter((etf) => etf.history.length > 0).length - visibleEtfs.length);

  return (
    <div className="chart-shell">
      <div className="chart-frame">
        <svg
          className="chart-svg"
          viewBox={`0 0 ${WIDE_CHART_WIDTH} ${WIDE_CHART_HEIGHT}`}
          role="img"
          aria-label="Confronto della crescita cumulata dei principali ETF"
        >
          {axisValues.map((value, index) => {
            const y = yScale(value);

            return (
              <g key={`${value}-${index}`}>
                <line
                  className="chart-grid-line"
                  x1={CHART_PADDING}
                  x2={WIDE_CHART_WIDTH - CHART_PADDING}
                  y1={y}
                  y2={y}
                />
                <text className="chart-axis-label" x={CHART_PADDING + 4} y={Math.max(18, y - 8)}>
                  {formatPercent(value)}
                </text>
              </g>
            );
          })}

          {minValue < 0 && maxValue > 0 ? (
            <line
              className="chart-zero-line"
              x1={CHART_PADDING}
              x2={WIDE_CHART_WIDTH - CHART_PADDING}
              y1={yScale(0)}
              y2={yScale(0)}
            />
          ) : null}

          {series.map((entry) => (
            <path
              key={entry.id}
              className="chart-series-line"
              d={buildLinePath(entry.points, getX, (point) => yScale(point.value))}
              style={{ stroke: entry.color }}
            />
          ))}
        </svg>
      </div>

      <div className="chart-series-list" aria-label="Legenda ETF del confronto">
        {series.map((entry) => (
          <span className="chart-series-chip" key={entry.id}>
            <span className="chart-series-swatch" style={{ background: entry.color }} />
            {entry.ticker}
          </span>
        ))}
      </div>

      <DateChartFoot
        data={allPoints}
        extra={
          hiddenSeriesCount > 0
            ? `Mostra i primi ${visibleEtfs.length} ETF per valore attuale`
            : "Crescita cumulata al netto dei flussi"
        }
      />
    </div>
  );
}

export function RiskReturnChart({ etfs }) {
  const visibleEtfs = etfs.filter((etf) => etf.currentValue > 0).slice(0, 10);

  if (!visibleEtfs.length) {
    return null;
  }

  const maxVolatility = Math.max(...visibleEtfs.map((etf) => etf.volatility), 0.01);
  const minReturn = Math.min(...visibleEtfs.map((etf) => etf.annualizedReturn), 0);
  const maxReturn = Math.max(...visibleEtfs.map((etf) => etf.annualizedReturn), 0.01);
  const maxCurrentValue = Math.max(...visibleEtfs.map((etf) => etf.currentValue), 1);
  const xScale = createXScale(0, maxVolatility, NARROW_CHART_WIDTH, CHART_PADDING);
  const yScale = createYScale(minReturn, maxReturn, NARROW_CHART_HEIGHT, CHART_PADDING);
  const xAxisValues = buildAscendingAxisValues(0, maxVolatility, 4);
  const yAxisValues = buildAxisValues(minReturn, maxReturn, 4);

  return (
    <div className="chart-shell">
      <div className="chart-frame">
        <svg
          className="chart-svg"
          viewBox={`0 0 ${NARROW_CHART_WIDTH} ${NARROW_CHART_HEIGHT}`}
          role="img"
          aria-label="Posizionamento degli ETF per rischio e rendimento annualizzato"
        >
          {xAxisValues.map((value, index) => {
            const x = xScale(value);

            return (
              <g key={`x-${value}-${index}`}>
                <line
                  className="chart-grid-line"
                  x1={x}
                  x2={x}
                  y1={CHART_PADDING}
                  y2={NARROW_CHART_HEIGHT - CHART_PADDING}
                />
                <text
                  className="chart-axis-label"
                  x={x}
                  y={NARROW_CHART_HEIGHT - 8}
                  textAnchor={index === 0 ? "start" : index === xAxisValues.length - 1 ? "end" : "middle"}
                >
                  {formatPercent(value)}
                </text>
              </g>
            );
          })}

          {yAxisValues.map((value, index) => {
            const y = yScale(value);

            return (
              <g key={`y-${value}-${index}`}>
                <line
                  className="chart-grid-line"
                  x1={CHART_PADDING}
                  x2={NARROW_CHART_WIDTH - CHART_PADDING}
                  y1={y}
                  y2={y}
                />
                <text className="chart-axis-label" x={CHART_PADDING + 4} y={Math.max(18, y - 8)}>
                  {formatPercent(value)}
                </text>
              </g>
            );
          })}

          {minReturn < 0 && maxReturn > 0 ? (
            <line
              className="chart-zero-line"
              x1={CHART_PADDING}
              x2={NARROW_CHART_WIDTH - CHART_PADDING}
              y1={yScale(0)}
              y2={yScale(0)}
            />
          ) : null}

          {visibleEtfs.map((etf, index) => {
            const x = xScale(etf.volatility);
            const y = yScale(etf.annualizedReturn);
            const radius = 8 + 14 * Math.sqrt(etf.currentValue / maxCurrentValue);
            const color = ETF_SERIES_COLORS[index % ETF_SERIES_COLORS.length];

            return (
              <g key={etf.id}>
                <circle className="chart-scatter-dot" cx={x} cy={y} r={radius} style={{ fill: color }} />
                <text className="chart-scatter-label" x={x} y={y - radius - 6} textAnchor="middle">
                  {etf.ticker}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <ScatterChartFoot
        left="Asse X: volatilita annua"
        right="Asse Y: rendimento annualizzato"
        extra="Dimensione bolla: valore attuale"
      />
    </div>
  );
}
