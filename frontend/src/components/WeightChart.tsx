import { useEffect, useRef, useState } from 'react'
import type { ProgressEntry } from '../types/progress'
import { formatDate } from '../utils/date'

interface WeightChartProps { entries: ProgressEntry[] }

function formatWeight(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })
}

export function WeightChart({ entries }: WeightChartProps) {
  // The SVG is drawn in CSS pixels of its container so labels keep a readable size on phones.
  const figure = useRef<HTMLElement | null>(null), [measuredWidth, setMeasuredWidth] = useState(700)
  useEffect(() => {
    const element = figure.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => setMeasuredWidth(Math.max(280, Math.round(entry.contentRect.width))))
    observer.observe(element)
    return () => observer.disconnect()
  }, [entries.length])
  const points = [...entries]
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
    .map((entry) => ({ ...entry, weight: Number(entry.weightKg) }))

  if (points.length < 2) return <div className="progress-chart__empty"><span aria-hidden="true">⌁</span><strong>O gráfico começa com dois registros.</strong><p>Seu histórico continua disponível logo abaixo.</p></div>

  const width = measuredWidth, height = Math.round(Math.min(260, Math.max(190, width * 0.5))), left = 58, right = 12, top = 16, bottom = 36
  const weights = points.map((point) => point.weight), min = Math.min(...weights), max = Math.max(...weights), range = max - min || 1
  const chartWidth = width - left - right, chartHeight = height - top - bottom
  const coords = points.map((point, index) => ({ ...point, x: left + index / (points.length - 1) * chartWidth, y: top + (max - point.weight) / range * chartHeight }))
  const line = coords.map((point) => `${point.x},${point.y}`).join(' ')
  const area = `${left},${height - bottom} ${line} ${width - right},${height - bottom}`
  const descriptionId = 'progress-chart-description'

  return <figure className="progress-chart" ref={figure}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`progress-chart-title ${descriptionId}`}>
      {[0, .5, 1].map((position) => { const y = top + position * chartHeight, value = max - position * range; return <g key={position}><line className="progress-chart__grid" x1={left} x2={width - right} y1={y} y2={y}/><text className="progress-chart__label" x={0} y={y + 4}>{value.toFixed(1)} kg</text></g> })}
      <polygon className="progress-chart__area" points={area}/><polyline className="progress-chart__line" points={line}/>
      {coords.map((point) => <circle key={point.id} className="progress-chart__point" cx={point.x} cy={point.y} r="5"><title>{formatDate(point.recordedAt)}: {point.weightKg} kg</title></circle>)}
      <text className="progress-chart__label" x={left} y={height - 12}>{formatDate(points[0].recordedAt)}</text><text className="progress-chart__label" textAnchor="end" x={width - right} y={height - 12}>{formatDate(points.at(-1)!.recordedAt)}</text>
    </svg>
    <figcaption id={descriptionId}>De {formatWeight(points[0].weight)} kg em {formatDate(points[0].recordedAt)} para {formatWeight(points.at(-1)!.weight)} kg em {formatDate(points.at(-1)!.recordedAt)}.</figcaption>
  </figure>
}
