import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAppStore } from "@/lib/store"
import { AsciiPane } from "./AsciiPane"
import {
  bresenham,
  cellKey,
  cellSettingsToCell,
  compositeLayers,
  lineToStamp,
  pixelToCell,
  rectToStamp,
  stampCells,
} from "@/lib/canvas-utils"
import type { Cell, GridPos } from "@/lib/types"
import { CELL_W, CELL_H } from "@/lib/constants"
import { cn } from "@/lib/utils"

// ─── single rendered cell ──────────────────────────────────────────────────

const CellDiv = memo(function CellDiv({
  cell,
  isHover,
  isPreview,
}: {
  cell: Cell | null
  isHover: boolean
  isPreview: boolean
}) {
  const bg = isPreview
    ? "rgba(100,150,255,0.35)"
    : cell?.bg ?? undefined

  return (
    <div
      className={cn(
        "border-r border-b border-border/30 flex items-center justify-center leading-none select-none",
        isHover && !cell && !isPreview && "bg-accent/40",
      )}
      style={{
        width: CELL_W,
        height: CELL_H,
        backgroundColor: bg,
        color: cell?.fg ?? undefined,
        fontSize: CELL_H * 0.85,
        fontFamily: "monospace",
      }}
    >
      {isPreview ? null : (cell?.char && cell.char !== " " ? cell.char : null)}
    </div>
  )
})

// ─── composited grid ───────────────────────────────────────────────────────

interface CanvasGridProps {
  composited: Map<string, Cell>
  preview: Map<string, Cell>
  hover: GridPos | null
  cols: number
  rows: number
  onMouseDown: (e: React.MouseEvent) => void
  onMouseMove: (e: React.MouseEvent) => void
  onMouseUp: (e: React.MouseEvent) => void
  onMouseLeave: () => void
  onClick: (e: React.MouseEvent) => void
  onDoubleClick: (e: React.MouseEvent) => void
}

function CanvasGrid({
  composited,
  preview,
  hover,
  cols,
  rows,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onMouseLeave,
  onClick,
  onDoubleClick,
}: CanvasGridProps) {
  return (
    <div
      className="relative border border-border cursor-crosshair"
      style={{ width: cols * CELL_W, height: rows * CELL_H }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      {/* checkerboard layer */}
      <div
        className="absolute inset-0 grid"
        style={{
          gridTemplateColumns: `repeat(${cols}, ${CELL_W}px)`,
          gridTemplateRows: `repeat(${rows}, ${CELL_H}px)`,
          pointerEvents: "none",
        }}
      >
        {Array.from({ length: cols * rows }).map((_, i) => {
          const r = Math.floor(i / cols)
          const c = i % cols
          return (
            <div
              key={i}
              className={cn(
                "border-r border-b border-border/20",
                (r + c) % 2 === 0 ? "bg-muted/20" : "bg-background",
              )}
            />
          )
        })}
      </div>

      {/* cell layer */}
      <div
        className="absolute inset-0 grid"
        style={{
          gridTemplateColumns: `repeat(${cols}, ${CELL_W}px)`,
          gridTemplateRows: `repeat(${rows}, ${CELL_H}px)`,
          pointerEvents: "none",
        }}
      >
        {Array.from({ length: cols * rows }).map((_, i) => {
          const r = Math.floor(i / cols)
          const c = i % cols
          const key = cellKey(c, r)
          const isPreview = preview.has(key)
          const isHover = hover?.col === c && hover?.row === r
          return (
            <CellDiv
              key={i}
              cell={isPreview ? preview.get(key)! : (composited.get(key) ?? null)}
              isHover={isHover}
              isPreview={isPreview}
            />
          )
        })}
      </div>
    </div>
  )
}

// ─── tool interaction hook ─────────────────────────────────────────────────

function useToolInteraction() {
  const tool = useAppStore((s) => s.tool)
  const thickness = useAppStore((s) => s.thickness)
  const cellSettings = useAppStore((s) => s.cell)
  const activeLayerId = useAppStore((s) => s.activeLayerId)
  const canvas = useAppStore((s) => s.canvas)
  const paintCells = useAppStore((s) => s.paintCells)
  const beginStroke = useAppStore((s) => s.beginStroke)
  const setHoverCell = useAppStore((s) => s.setHoverCell)
  const hover = useAppStore((s) => s.hoverCell)

  const [preview, setPreview] = useState<Map<string, Cell>>(new Map())
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef<GridPos | null>(null)
  // polygon: accumulate clicked vertices
  const polyPoints = useRef<GridPos[]>([])
  const [polyActive, setPolyActive] = useState(false)

  const activeCell = cellSettingsToCell(cellSettings)

  const cellFromEvent = (e: React.MouseEvent): GridPos => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    return pixelToCell(e.clientX - rect.left, e.clientY - rect.top)
  }

  const commitPreview = useCallback(() => {
    if (!activeLayerId || preview.size === 0) return
    paintCells(activeLayerId, [...preview.entries()])
    setPreview(new Map())
  }, [activeLayerId, paintCells, preview])

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      const pos = cellFromEvent(e)

      beginStroke()
      if (tool === "brush") {
        setIsDragging(true)
        const entries = stampCells(pos.col, pos.row, thickness, activeCell, canvas.cols, canvas.rows)
        if (activeLayerId) paintCells(activeLayerId, entries)
      } else if (tool === "line") {
        setIsDragging(true)
        dragStart.current = pos
      } else if (tool === "rectangle") {
        setIsDragging(true)
        dragStart.current = pos
      } else if (tool === "polygon") {
        if (!polyActive) {
          setPolyActive(true)
          polyPoints.current = [pos]
        } else {
          polyPoints.current.push(pos)
        }
      }
    },
    [tool, thickness, activeCell, activeLayerId, canvas, paintCells, beginStroke, polyActive],
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const pos = cellFromEvent(e)
      setHoverCell(pos)

      if (tool === "brush" && isDragging) {
        const entries = stampCells(pos.col, pos.row, thickness, activeCell, canvas.cols, canvas.rows)
        if (activeLayerId) paintCells(activeLayerId, entries)
        return
      }

      if (tool === "line" && isDragging && dragStart.current) {
        const pts = bresenham(dragStart.current.col, dragStart.current.row, pos.col, pos.row)
        const entries = lineToStamp(pts, thickness, activeCell, canvas.cols, canvas.rows)
        setPreview(new Map(entries))
        return
      }

      if (tool === "rectangle" && isDragging && dragStart.current) {
        const entries = rectToStamp(
          dragStart.current.col, dragStart.current.row,
          pos.col, pos.row,
          thickness, activeCell, canvas.cols, canvas.rows,
          false,
        )
        setPreview(new Map(entries))
        return
      }

      if (tool === "polygon" && polyActive && polyPoints.current.length > 0) {
        const last = polyPoints.current[polyPoints.current.length - 1]
        const pts = bresenham(last.col, last.row, pos.col, pos.row)
        const entries = lineToStamp(pts, thickness, activeCell, canvas.cols, canvas.rows)
        // also show all committed poly edges
        const all: [string, Cell][] = []
        const seen = new Set<string>()
        for (let i = 1; i < polyPoints.current.length; i++) {
          const a = polyPoints.current[i - 1]
          const b = polyPoints.current[i]
          for (const [k, c] of lineToStamp(bresenham(a.col, a.row, b.col, b.row), thickness, activeCell, canvas.cols, canvas.rows)) {
            if (!seen.has(k)) { seen.add(k); all.push([k, c]) }
          }
        }
        for (const [k, c] of entries) {
          if (!seen.has(k)) { seen.add(k); all.push([k, c]) }
        }
        setPreview(new Map(all))
      }
    },
    [tool, isDragging, thickness, activeCell, activeLayerId, canvas, paintCells, setHoverCell, polyActive],
  )

  const handleMouseUp = useCallback(
    (_e: React.MouseEvent) => {
      if (tool === "brush") {
        setIsDragging(false)
        return
      }
      if ((tool === "line" || tool === "rectangle") && isDragging) {
        commitPreview()
        setIsDragging(false)
        dragStart.current = null
      }
    },
    [tool, isDragging, commitPreview],
  )

  const handleMouseLeave = useCallback(() => {
    setHoverCell(null)
    if (tool === "brush") setIsDragging(false)
  }, [tool, setHoverCell])

  const handleClick = useCallback(() => {
    // polygon click handled in mousedown
  }, [])

  const handleDoubleClick = useCallback(
    (_e: React.MouseEvent) => {
      if (tool === "polygon" && polyActive) {
        // close: draw line from last point back to first
        if (polyPoints.current.length >= 2) {
          const first = polyPoints.current[0]
          const last = polyPoints.current[polyPoints.current.length - 1]
          const seen = new Set<string>()
          const all: [string, Cell][] = []
          for (let i = 1; i < polyPoints.current.length; i++) {
            const a = polyPoints.current[i - 1]
            const b = polyPoints.current[i]
            for (const [k, c] of lineToStamp(bresenham(a.col, a.row, b.col, b.row), thickness, activeCell, canvas.cols, canvas.rows)) {
              if (!seen.has(k)) { seen.add(k); all.push([k, c]) }
            }
          }
          // closing edge
          for (const [k, c] of lineToStamp(bresenham(last.col, last.row, first.col, first.row), thickness, activeCell, canvas.cols, canvas.rows)) {
            if (!seen.has(k)) { seen.add(k); all.push([k, c]) }
          }
          if (activeLayerId) paintCells(activeLayerId, all)
        }
        polyPoints.current = []
        setPolyActive(false)
        setPreview(new Map())
      }
    },
    [tool, polyActive, thickness, activeCell, activeLayerId, canvas, paintCells],
  )

  // Esc cancels polygon
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && polyActive) {
        polyPoints.current = []
        setPolyActive(false)
        setPreview(new Map())
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [polyActive])

  return {
    preview,
    hover,
    polyActive,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
    handleClick,
    handleDoubleClick,
  }
}

// ─── status bar ────────────────────────────────────────────────────────────

function StatusBar({ polyActive }: { polyActive: boolean }) {
  const hover = useAppStore((s) => s.hoverCell)
  const canvas = useAppStore((s) => s.canvas)
  const tool = useAppStore((s) => s.tool)

  const hint =
    tool === "polygon"
      ? polyActive
        ? "click to add point · double-click to close · Esc to cancel"
        : "click to start polygon"
      : tool === "line" || tool === "rectangle"
      ? "click and drag"
      : "click or drag to paint"

  return (
    <div className="flex items-center gap-4 px-3 py-0.5 border-t bg-muted/30 text-[10px] text-muted-foreground shrink-0">
      {hover ? (
        <span>
          {hover.col},{hover.row}
        </span>
      ) : (
        <span>—</span>
      )}
      <span>{canvas.cols}×{canvas.rows}</span>
      <span className="flex-1 text-center">{hint}</span>
    </div>
  )
}

// ─── image mode ────────────────────────────────────────────────────────────

function ImageModeView() {
  const canvas = useAppStore((s) => s.canvas)
  const cols = canvas.cols
  const rows = canvas.rows

  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">output</span>
      <div
        className="border border-border bg-background relative"
        style={{ width: cols * CELL_W, height: rows * CELL_H }}
      >
        <div className="text-[10px] text-muted-foreground p-1 absolute inset-0 flex items-center justify-center">
          (no image placed yet)
        </div>
      </div>
      <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground pt-2">image placement</span>
      <div
        className="border border-border bg-background relative"
        style={{ width: cols * CELL_W, height: Math.floor(rows / 2) * CELL_H }}
      >
        <div
          className="absolute rounded-sm border-2 border-yellow-400/80 bg-yellow-300/20"
          style={{ top: 20, left: 120, width: 160, height: 80 }}
        />
      </div>
    </div>
  )
}

// ─── main ─────────────────────────────────────────────────────────────────

function useUndoRedo() {
  const undo = useAppStore((s) => s.undo)
  const redo = useAppStore((s) => s.redo)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      if (e.key === "z" && !e.shiftKey) { e.preventDefault(); undo() }
      if ((e.key === "z" && e.shiftKey) || e.key === "y") { e.preventDefault(); redo() }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [undo, redo])
}

export function Canvas() {
  const imageMode = useAppStore((s) => s.imageMode)
  const mode = useAppStore((s) => s.mode)
  const layers = useAppStore((s) => s.layers)
  const canvas = useAppStore((s) => s.canvas)

  useUndoRedo()

  const composited = useMemo(
    () => compositeLayers(layers, canvas.cols, canvas.rows),
    [layers, canvas],
  )

  const {
    preview,
    hover,
    polyActive,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
    handleClick,
    handleDoubleClick,
  } = useToolInteraction()

  if (mode === "ascii") {
    return <AsciiPane />
  }

  if (imageMode) {
    return (
      <section className="flex-1 min-w-0 min-h-0 flex flex-col">
        <div className="flex-1 overflow-auto flex items-start justify-center bg-muted/20">
          <ImageModeView />
        </div>
        <StatusBar polyActive={false} />
      </section>
    )
  }

  return (
    <section className="flex-1 min-w-0 min-h-0 flex flex-col">
      <div className="flex-1 overflow-auto flex items-center justify-center bg-muted/20 p-4">
        <CanvasGrid
          composited={composited}
          preview={preview}
          hover={hover}
          cols={canvas.cols}
          rows={canvas.rows}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
        />
      </div>
      <StatusBar polyActive={polyActive} />
    </section>
  )
}
