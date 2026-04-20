import { useCallback, useMemo, useRef, useState } from "react"
import { useAppStore } from "@/lib/store"
import {
  bresenham,
  cellKey,
  compositeLayers,
  lineAngle,
  lineToStamp,
  pickLineGlyph,
  pixelToCell,
} from "@/lib/canvas-utils"
import type { Cell } from "@/lib/types"
import { CELL_W, CELL_H } from "@/lib/constants"
import { Button } from "@/components/ui/button"

// ─── types ─────────────────────────────────────────────────────────────────

interface Stroke {
  x1: number
  y1: number
  x2: number
  y2: number
}

// ─── ASCII preview pane ────────────────────────────────────────────────────

function AsciiPreview() {
  const canvas = useAppStore((s) => s.canvas)
  const layers = useAppStore((s) => s.layers)

  const asciiLayers = useMemo(
    () => layers.filter((l) => l.kind === "ascii" && l.visible),
    [layers],
  )

  const composited: Map<string, Cell> = useMemo(
    () => compositeLayers(asciiLayers, canvas.cols, canvas.rows),
    [asciiLayers, canvas.cols, canvas.rows],
  )

  const rows = useMemo(() => {
    return Array.from({ length: canvas.rows }, (_, r) => {
      return Array.from({ length: canvas.cols }, (_, c) => {
        const key = cellKey(c, r)
        const cell = composited.get(key)
        return cell?.char ?? " "
      }).join("")
    })
  }, [composited, canvas.cols, canvas.rows])

  return (
    <pre
      className="overflow-auto bg-background text-foreground font-mono leading-none select-none"
      style={{
        fontSize: CELL_H * 0.85,
        lineHeight: `${CELL_H}px`,
        letterSpacing: 0,
        whiteSpace: "pre",
      }}
    >
      {rows.map((row, r) => (
        <div key={r} style={{ height: CELL_H }}>
          {Array.from(row).map((ch, c) => (
            <span
              key={c}
              style={{ display: "inline-block", width: CELL_W, height: CELL_H }}
            >
              {ch}
            </span>
          ))}
        </div>
      ))}
    </pre>
  )
}

// ─── vector draw surface ───────────────────────────────────────────────────

interface DrawSurfaceProps {
  strokes: Stroke[]
  preview: Stroke | null
  cols: number
  rows: number
  onMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void
  onMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void
  onMouseUp: (e: React.MouseEvent<SVGSVGElement>) => void
  onMouseLeave: () => void
}

function DrawSurface({
  strokes,
  preview,
  cols,
  rows,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onMouseLeave,
}: DrawSurfaceProps) {
  const width = cols * CELL_W
  const height = rows * CELL_H

  return (
    <svg
      width={width}
      height={height}
      className="cursor-crosshair border border-border bg-background block"
      style={{ display: "block" }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
    >
      {/* grid guide lines */}
      {Array.from({ length: cols + 1 }, (_, i) => (
        <line
          key={`v${i}`}
          x1={i * CELL_W}
          y1={0}
          x2={i * CELL_W}
          y2={height}
          stroke="rgba(128,128,128,0.15)"
          strokeWidth={1}
        />
      ))}
      {Array.from({ length: rows + 1 }, (_, i) => (
        <line
          key={`h${i}`}
          x1={0}
          y1={i * CELL_H}
          x2={width}
          y2={i * CELL_H}
          stroke="rgba(128,128,128,0.15)"
          strokeWidth={1}
        />
      ))}

      {/* committed strokes */}
      {strokes.map((s, i) => (
        <line
          key={i}
          x1={s.x1}
          y1={s.y1}
          x2={s.x2}
          y2={s.y2}
          stroke="black"
          strokeWidth={1}
        />
      ))}

      {/* preview line */}
      {preview && (
        <line
          x1={preview.x1}
          y1={preview.y1}
          x2={preview.x2}
          y2={preview.y2}
          stroke="black"
          strokeWidth={1}
          strokeDasharray="4 3"
          opacity={0.6}
        />
      )}
    </svg>
  )
}

// ─── main component ────────────────────────────────────────────────────────

export function AsciiPane(): React.ReactElement {
  const canvas = useAppStore((s) => s.canvas)
  const activeLayerId = useAppStore((s) => s.activeLayerId)
  const layers = useAppStore((s) => s.layers)
  const thickness = useAppStore((s) => s.thickness)
  const cellSettings = useAppStore((s) => s.cell)
  const paintCells = useAppStore((s) => s.paintCells)
  const beginStroke = useAppStore((s) => s.beginStroke)
  const undo = useAppStore((s) => s.undo)

  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [preview, setPreview] = useState<Stroke | null>(null)
  const dragStart = useRef<{ x: number; y: number } | null>(null)
  const isDragging = useRef(false)

  const svgPoint = useCallback(
    (e: React.MouseEvent<SVGSVGElement>): { x: number; y: number } => {
      const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      }
    },
    [],
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (e.button !== 0) return
      const pt = svgPoint(e)
      dragStart.current = pt
      isDragging.current = true
    },
    [svgPoint],
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!isDragging.current || !dragStart.current) return
      const pt = svgPoint(e)
      setPreview({
        x1: dragStart.current.x,
        y1: dragStart.current.y,
        x2: pt.x,
        y2: pt.y,
      })
    },
    [svgPoint],
  )

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!isDragging.current || !dragStart.current) return
      const pt = svgPoint(e)
      const newStroke: Stroke = {
        x1: dragStart.current.x,
        y1: dragStart.current.y,
        x2: pt.x,
        y2: pt.y,
      }
      setStrokes((prev) => [...prev, newStroke])
      setPreview(null)
      isDragging.current = false
      dragStart.current = null
    },
    [svgPoint],
  )

  const handleMouseLeave = useCallback(() => {
    if (isDragging.current && dragStart.current && preview) {
      // commit if mouse leaves mid-drag
      setStrokes((prev) => [...prev, preview])
    }
    setPreview(null)
    isDragging.current = false
    dragStart.current = null
  }, [preview])

  const handleConfirm = useCallback(() => {
    const asciiLayers = layers.filter((l) => l.kind === "ascii")
    const effectiveLayerId =
      asciiLayers.find((l) => l.id === activeLayerId)?.id ??
      asciiLayers.find((l) => l.visible)?.id ??
      null

    if (!effectiveLayerId || strokes.length === 0) return

    beginStroke()

    const entries: [string, Cell][] = []
    const seen = new Set<string>()

    for (const stroke of strokes) {
      const start = pixelToCell(stroke.x1, stroke.y1)
      const end = pixelToCell(stroke.x2, stroke.y2)

      const angle = lineAngle(start.col, start.row, end.col, end.row)
      const glyph = pickLineGlyph(angle, thickness)
      const cell: Cell = { char: glyph, fg: cellSettings.textureColor, bg: null }

      const points = bresenham(start.col, start.row, end.col, end.row)
      const stamped = lineToStamp(points, thickness, cell, canvas.cols, canvas.rows)

      for (const [key, stammedCell] of stamped) {
        if (!seen.has(key)) {
          seen.add(key)
          entries.push([key, stammedCell])
        }
      }
    }

    if (entries.length > 0) {
      paintCells(effectiveLayerId, entries)
    }
    setStrokes([])
  }, [activeLayerId, layers, strokes, thickness, cellSettings, canvas.cols, canvas.rows, paintCells, beginStroke])

  const handleClear = useCallback(() => {
    setStrokes([])
    setPreview(null)
  }, [])

  const handleUndo = useCallback(() => {
    undo()
  }, [undo])

  return (
    <section className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
      {/* ── top pane: ASCII preview (60%) ─────────────────────────── */}
      <div className="flex flex-col border-b border-border" style={{ flex: "0 0 60%" }}>
        <div className="px-3 py-1 border-b border-border bg-muted/40 shrink-0">
          <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-semibold">
            ASCII PREVIEW
          </span>
        </div>
        <div className="flex-1 overflow-auto bg-muted/20 flex items-start justify-center p-4">
          <AsciiPreview />
        </div>
      </div>

      {/* ── bottom pane: vector draw (40%) ────────────────────────── */}
      <div className="flex flex-col" style={{ flex: "0 0 40%" }}>
        <div className="px-3 py-1 border-b border-border bg-muted/40 shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-semibold">
              DRAW
            </span>
            {strokes.length > 0 && (
              <span className="inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 min-w-[18px] leading-none">
                {strokes.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button size="xs" variant="outline" onClick={handleUndo}>
              Undo
            </Button>
            <Button size="xs" variant="outline" onClick={handleClear} disabled={strokes.length === 0}>
              Clear
            </Button>
            <Button size="xs" onClick={handleConfirm} disabled={strokes.length === 0}>
              Confirm
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-auto flex items-start justify-center bg-muted/20 p-4">
          <DrawSurface
            strokes={strokes}
            preview={preview}
            cols={canvas.cols}
            rows={canvas.rows}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
          />
        </div>
      </div>
    </section>
  )
}
