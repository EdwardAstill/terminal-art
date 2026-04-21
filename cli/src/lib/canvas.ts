import type { CanvasSize, Cell, GridPos, Layer } from "./types.js"

export function cellKey(col: number, row: number): string {
  return `${col},${row}`
}

export function bresenham(c0: number, r0: number, c1: number, r1: number): GridPos[] {
  const points: GridPos[] = []
  let dc = Math.abs(c1 - c0)
  let dr = Math.abs(r1 - r0)
  const sc = c0 < c1 ? 1 : -1
  const sr = r0 < r1 ? 1 : -1
  let err = dc - dr
  let c = c0
  let r = r0
  while (true) {
    points.push({ col: c, row: r })
    if (c === c1 && r === r1) break
    const e2 = 2 * err
    if (e2 > -dr) {
      err -= dr
      c += sc
    }
    if (e2 < dc) {
      err += dc
      r += sr
    }
  }
  return points
}

export function pickLineGlyph(angleDeg: number, thickness: number): string {
  const a = ((angleDeg % 360) + 360) % 360
  const tol = 22.5

  if (a <= tol || a >= 360 - tol || (a >= 180 - tol && a <= 180 + tol)) return thickness > 1 ? "━" : "─"
  if ((a >= 90 - tol && a <= 90 + tol) || (a >= 270 - tol && a <= 270 + tol)) return thickness > 1 ? "┃" : "│"
  if ((a >= 45 - tol && a <= 45 + tol) || (a >= 225 - tol && a <= 225 + tol)) return "╱"
  if ((a >= 135 - tol && a <= 135 + tol) || (a >= 315 - tol && a <= 315 + tol)) return "╲"
  return "█"
}

export function pickCoverageGlyph(mask: number): string {
  switch (mask) {
    case 0:
      return " "
    case 1:
      return "▘"
    case 2:
      return "▝"
    case 3:
      return "▀"
    case 4:
      return "▖"
    case 5:
      return "▌"
    case 6:
      return "▚"
    case 7:
      return "▛"
    case 8:
      return "▗"
    case 9:
      return "▞"
    case 10:
      return "▐"
    case 11:
      return "▜"
    case 12:
      return "▄"
    case 13:
      return "▙"
    case 14:
      return "▟"
    case 15:
      return "█"
    default:
      return "█"
  }
}

export function lineAngle(c0: number, r0: number, c1: number, r1: number): number {
  const deg = Math.atan2(r1 - r0, c1 - c0) * 180 / Math.PI
  return ((deg % 360) + 360) % 360
}

export interface PaintBrush {
  char: string
  fg: string
  bg: string | null
}

export function stampPoint(
  col: number,
  row: number,
  thickness: number,
  brush: PaintBrush,
  cols: number,
  rows: number,
): [string, Cell][] {
  const half = Math.floor(thickness / 2)
  const entries: [string, Cell][] = []
  for (let dr = -half; dr <= half; dr++) {
    for (let dc = -half; dc <= half; dc++) {
      const tc = col + dc
      const tr = row + dr
      if (tc >= 0 && tc < cols && tr >= 0 && tr < rows) {
        entries.push([cellKey(tc, tr), brush])
      }
    }
  }
  return entries
}

export function rasterLine(
  c0: number,
  r0: number,
  c1: number,
  r1: number,
  thickness: number,
  brush: PaintBrush,
  cols: number,
  rows: number,
): [string, Cell][] {
  const seen = new Set<string>()
  const result: [string, Cell][] = []
  for (const p of bresenham(c0, r0, c1, r1)) {
    for (const [key, cell] of stampPoint(p.col, p.row, thickness, brush, cols, rows)) {
      if (!seen.has(key)) {
        seen.add(key)
        result.push([key, cell])
      }
    }
  }
  return result
}

export function rasterPolyline(
  points: GridPos[],
  thickness: number,
  brush: PaintBrush,
  cols: number,
  rows: number,
): [string, Cell][] {
  const seen = new Set<string>()
  const result: [string, Cell][] = []
  for (let i = 1; i < points.length; i++) {
    for (const [key, cell] of rasterLine(points[i - 1].col, points[i - 1].row, points[i].col, points[i].row, thickness, brush, cols, rows)) {
      if (!seen.has(key)) {
        seen.add(key)
        result.push([key, cell])
      }
    }
  }
  return result
}

export function rasterCircle(
  cx: number,
  cy: number,
  radius: number,
  thickness: number,
  brush: PaintBrush,
  cols: number,
  rows: number,
  filled: boolean,
  aspectY = 2,
): [string, Cell][] {
  const seen = new Set<string>()
  const result: [string, Cell][] = []
  const minX = Math.floor(cx - radius - thickness)
  const maxX = Math.ceil(cx + radius + thickness)
  const minY = Math.floor(cy - radius - thickness)
  const maxY = Math.ceil(cy + radius + thickness)
  const outer = radius + thickness / 2
  const inner = Math.max(0, radius - thickness / 2)

  for (let row = minY; row <= maxY; row++) {
    for (let col = minX; col <= maxX; col++) {
      if (col < 0 || col >= cols || row < 0 || row >= rows) continue
      const dx = col + 0.5 - cx
      const dy = row + 0.5 - cy
      const dist = Math.hypot(dx, dy * aspectY)
      const inFill = dist <= radius
      const onRing = dist >= inner && dist <= outer
      if (filled ? inFill : onRing) {
        const key = cellKey(col, row)
        if (!seen.has(key)) {
          seen.add(key)
          result.push([key, brush])
        }
      }
    }
  }

  return result
}

export function rasterEllipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  thickness: number,
  brush: PaintBrush,
  cols: number,
  rows: number,
  filled: boolean,
  aspectY = 2,
): [string, Cell][] {
  const seen = new Set<string>()
  const result: [string, Cell][] = []
  const minX = Math.floor(cx - rx - thickness)
  const maxX = Math.ceil(cx + rx + thickness)
  const minY = Math.floor(cy - ry - thickness)
  const maxY = Math.ceil(cy + ry + thickness)
  const outer = 1 + thickness / Math.max(rx, ry, 1)
  const inner = Math.max(0, 1 - thickness / Math.max(rx, ry, 1))

  for (let row = minY; row <= maxY; row++) {
    for (let col = minX; col <= maxX; col++) {
      if (col < 0 || col >= cols || row < 0 || row >= rows) continue
      const dx = (col + 0.5 - cx) / rx
      const dy = ((row + 0.5 - cy) * aspectY) / ry
      const norm = dx * dx + dy * dy
      const inFill = norm <= 1
      const onRing = norm >= inner * inner && norm <= outer * outer
      if (filled ? inFill : onRing) {
        const key = cellKey(col, row)
        if (!seen.has(key)) {
          seen.add(key)
          result.push([key, brush])
        }
      }
    }
  }

  return result
}

export function catmullRom(points: GridPos[], samplesPerSegment = 12): GridPos[] {
  if (points.length < 2) return points
  const result: GridPos[] = []
  const p = points
  const get = (i: number): GridPos => p[Math.max(0, Math.min(p.length - 1, i))]

  for (let i = 0; i < p.length - 1; i++) {
    const p0 = get(i - 1)
    const p1 = get(i)
    const p2 = get(i + 1)
    const p3 = get(i + 2)
    for (let s = 0; s < samplesPerSegment; s++) {
      const t = s / samplesPerSegment
      const t2 = t * t
      const t3 = t2 * t
      const x = 0.5 * (
        (2 * p1.col) +
        (-p0.col + p2.col) * t +
        (2 * p0.col - 5 * p1.col + 4 * p2.col - p3.col) * t2 +
        (-p0.col + 3 * p1.col - 3 * p2.col + p3.col) * t3
      )
      const y = 0.5 * (
        (2 * p1.row) +
        (-p0.row + p2.row) * t +
        (2 * p0.row - 5 * p1.row + 4 * p2.row - p3.row) * t2 +
        (-p0.row + 3 * p1.row - 3 * p2.row + p3.row) * t3
      )
      result.push({ col: x, row: y })
    }
  }
  result.push(points[points.length - 1])
  return result
}

export function cloneLayer(layer: Layer): Layer {
  return {
    ...layer,
    cells: { ...layer.cells },
  }
}

export function compositeLayers(layers: Layer[], cols: number, rows: number): Map<string, Cell> {
  const bgMap = new Map<string, Cell>()
  for (const layer of layers) {
    if (!layer.visible || layer.kind !== "ansi") continue
    for (const [key, cell] of Object.entries(layer.cells)) {
      const [c, r] = key.split(",").map(Number)
      if (c >= 0 && c < cols && r >= 0 && r < rows) bgMap.set(key, cell)
    }
  }

  const charMap = new Map<string, Cell>()
  for (const layer of layers) {
    if (!layer.visible || layer.kind !== "ascii") continue
    for (const [key, cell] of Object.entries(layer.cells)) {
      const [c, r] = key.split(",").map(Number)
      if (c >= 0 && c < cols && r >= 0 && r < rows) charMap.set(key, cell)
    }
  }

  const result = new Map<string, Cell>()
  const allKeys = new Set([...bgMap.keys(), ...charMap.keys()])
  for (const key of allKeys) {
    const ansiCell = bgMap.get(key)
    const asciiCell = charMap.get(key)
    if (asciiCell && ansiCell) {
      result.set(key, { char: asciiCell.char, fg: asciiCell.fg, bg: ansiCell.bg })
    } else if (asciiCell) {
      result.set(key, asciiCell)
    } else if (ansiCell) {
      result.set(key, ansiCell)
    }
  }
  return result
}

export function createFilledCell(char: string, fg: string, bg: string | null): Cell {
  return { char, fg, bg }
}

export function getLineCells(
  start: GridPos,
  end: GridPos,
  thickness: number,
  cell: Cell,
  cols: number,
  rows: number,
): [string, Cell][] {
  const points = bresenham(start.col, start.row, end.col, end.row)
  const seen = new Set<string>()
  const result: [string, Cell][] = []
  const half = Math.floor(thickness / 2)

  for (const p of points) {
    for (let dr = -half; dr <= half; dr++) {
      for (let dc = -half; dc <= half; dc++) {
        const c = p.col + dc
        const r = p.row + dr
        if (c < 0 || c >= cols || r < 0 || r >= rows) continue
        const key = cellKey(c, r)
        if (!seen.has(key)) {
          seen.add(key)
          result.push([key, cell])
        }
      }
    }
  }

  return result
}

export function getRectCells(
  a: GridPos,
  b: GridPos,
  thickness: number,
  cell: Cell,
  cols: number,
  rows: number,
  filled: boolean,
): [string, Cell][] {
  const minC = Math.min(a.col, b.col)
  const maxC = Math.max(a.col, b.col)
  const minR = Math.min(a.row, b.row)
  const maxR = Math.max(a.row, b.row)
  const seen = new Set<string>()
  const result: [string, Cell][] = []

  const stamp = (col: number, row: number) => {
    const half = Math.floor(thickness / 2)
    for (let dr = -half; dr <= half; dr++) {
      for (let dc = -half; dc <= half; dc++) {
        const c = col + dc
        const r = row + dr
        if (c < 0 || c >= cols || r < 0 || r >= rows) continue
        const key = cellKey(c, r)
        if (!seen.has(key)) {
          seen.add(key)
          result.push([key, cell])
        }
      }
    }
  }

  if (filled) {
    for (let row = minR; row <= maxR; row++) {
      for (let col = minC; col <= maxC; col++) {
        stamp(col, row)
      }
    }
    return result
  }

  for (let col = minC; col <= maxC; col++) {
    stamp(col, minR)
    stamp(col, maxR)
  }
  for (let row = minR + 1; row < maxR; row++) {
    stamp(minC, row)
    stamp(maxC, row)
  }
  return result
}

export function cropLayers(layers: Layer[], canvas: CanvasSize): Layer[] {
  return layers.map((layer) => {
    const cells: Record<string, Cell> = {}
    for (const [key, cell] of Object.entries(layer.cells)) {
      const [col, row] = key.split(",").map(Number)
      if (col >= 0 && col < canvas.cols && row >= 0 && row < canvas.rows) {
        cells[key] = cell
      }
    }
    return { ...layer, cells }
  })
}
