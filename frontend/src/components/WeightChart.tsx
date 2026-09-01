import type { ProgressEntry } from '../types/progress'
import { formatDate } from '../utils/date'
interface WeightChartProps { entries: ProgressEntry[] }
export function WeightChart({ entries }: WeightChartProps) {
  const points = [...entries].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt)).map((entry) => ({ ...entry, weight: Number(entry.weightKg) }))
  if (points.length < 2) return <div className="chart__empty">Adicione pelo menos dois registros para visualizar a evolução.</div>
  const width = 700, height = 260, left = 48, right = 20, top = 24, bottom = 40
  const weights = points.map((point) => point.weight), min = Math.min(...weights), max = Math.max(...weights), range = max - min || 1
  const chartWidth = width - left - right, chartHeight = height - top - bottom
  const coords = points.map((point, index) => ({ ...point, x: left + index / (points.length - 1) * chartWidth, y: top + (max - point.weight) / range * chartHeight }))
  const line = coords.map((point) => `${point.x},${point.y}`).join(' ')
  const area = `${left},${height - bottom} ${line} ${width - right},${height - bottom}`
  return <div className="chart"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Gráfico da evolução do peso">
    <defs><linearGradient id="chart-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#77a983" stopOpacity=".28"/><stop offset="1" stopColor="#77a983" stopOpacity="0"/></linearGradient></defs>
    {[0, .5, 1].map((position) => { const y = top + position * chartHeight, value = max - position * range; return <g key={position}><line className="chart__grid" x1={left} x2={width - right} y1={y} y2={y}/><text className="chart__label" x={0} y={y + 4}>{value.toFixed(1)} kg</text></g> })}
    <polygon className="chart__area" points={area}/><polyline className="chart__line" points={line}/>
    {coords.map((point) => <circle key={point.id} className="chart__point" cx={point.x} cy={point.y} r="5"><title>{formatDate(point.recordedAt)}: {point.weightKg} kg</title></circle>)}
    <text className="chart__label" x={left} y={height - 12}>{formatDate(points[0].recordedAt)}</text><text className="chart__label" textAnchor="end" x={width - right} y={height - 12}>{formatDate(points.at(-1)!.recordedAt)}</text>
  </svg></div>
}
