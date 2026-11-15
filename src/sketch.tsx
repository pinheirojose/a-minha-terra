import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import rough from 'roughjs'

const INK = '#2d2a26'

/** A box with a hand-drawn border that redraws on resize. Fixed seed = same wobble every render. */
export function Sketch({ children, seed = 1, className = '', as: Tag = 'div', fill, stroke = INK, style }: {
  children: ReactNode; seed?: number; className?: string; as?: 'div' | 'section' | 'header'
  fill?: string; stroke?: string; style?: CSSProperties
}) {
  const box = useRef<HTMLElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  useLayoutEffect(() => {
    const el = box.current!, s = svg.current!
    const draw = () => {
      const { width: w, height: h } = el.getBoundingClientRect()
      if (w < 10 || h < 10) return
      s.replaceChildren(rough.svg(s).rectangle(4, 4, w - 8, h - 8, {
        seed, roughness: 1.3, bowing: 1.2, stroke, strokeWidth: 2,
        fill, fillStyle: 'solid',
      }))
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(el)
    return () => ro.disconnect()
  }, [seed, fill, stroke])
  return (
    <Tag ref={box as never} className={`sketch ${className}`} style={style}>
      <svg ref={svg} className="sketch-border" aria-hidden="true" />
      {children}
    </Tag>
  )
}

/** Loading placeholder: a few wobbly pencil lines that pulse. */
export function Skeleton({ lines = 3, label = 'Loading' }: { lines?: number; label?: string }) {
  const svg = useRef<SVGSVGElement>(null)
  useLayoutEffect(() => {
    const rc = rough.svg(svg.current!)
    svg.current!.replaceChildren(...Array.from({ length: lines }, (_, i) =>
      rc.line(4, 12 + i * 22, 196 - ((i * 47) % 70), 12 + i * 22, { seed: i + 3, roughness: 2, stroke: '#b9b2a6', strokeWidth: 6 })))
  }, [lines])
  return (
    <svg ref={svg} className="skeleton" viewBox={`0 0 200 ${lines * 22 + 2}`} preserveAspectRatio="none" role="status" aria-label={label} />
  )
}

/** Sketch-style bar chart in a fixed viewBox (scales with CSS width). */
export function Bars({ values, labels, format, color, title }: {
  values: number[]; labels: string[]; format: (n: number) => string; color: string; title: string
}) {
  const g = useRef<SVGGElement>(null)
  const W = 360, H = 170, top = 10, bottom = 22, left = 6
  const max = Math.max(...values, 1)
  const step = (W - left * 2) / values.length
  useLayoutEffect(() => {
    const rc = rough.svg(g.current!.ownerSVGElement!)
    const nodes = [rc.line(left, H - bottom, W - left, H - bottom, { seed: 2, stroke: INK, roughness: 1.2 })]
    values.forEach((v, i) => {
      if (v <= 0) return
      const h = Math.max(2, (v / max) * (H - top - bottom))
      const node = rc.rectangle(left + i * step + 4, H - bottom - h, step - 8, h, {
        seed: i + 10, stroke: INK, strokeWidth: 1.2, roughness: 1.1,
        fill: color, fillStyle: 'hachure', hachureGap: 4, fillWeight: 1.2,
      })
      const tip = document.createElementNS('http://www.w3.org/2000/svg', 'title')
      tip.textContent = `${labels[i]}: ${format(v)}`
      node.prepend(tip)
      nodes.push(node)
    })
    g.current!.replaceChildren(...nodes)
  }, [values, labels, format, max, step, color])
  const summary = values.map((v, i) => `${labels[i]} ${format(v)}`).join(', ')
  return (
    <svg className="bars" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${summary}`}>
      <g ref={g} />
      {labels.map((l, i) => (
        <text key={i} x={left + i * step + step / 2} y={H - 5} textAnchor="middle">{l}</text>
      ))}
    </svg>
  )
}
