import type { Cell, CellSettings, GridPos, Layer } from "./types"
import { CELL_W, CELL_H } from "./constants"

export function pixelToCell(offsetX: number, offsetY: number): GridPos {
  return {
    col: Math.floor(offsetX / CELL_W),
    row: Math.floor(offsetY / CELL_H),
  }
}

export function cellKey(col: number, row: number): string {
  return `${col},${row}`
}

const FULL_BLOCK_CHARS = new Set(["█", "▉", "▊", "▋", "▌", "▍", "▎", "▏"])

export function cellSettingsToCell(settings: CellSettings): Cell {
  if (settings.fillMode === "symbol") {
    const sym = settings.symbol
    if (!sym || FULL_BLOCK_CHARS.has(sym)) {
      // Full block = solid colour fill — store as space with bg only
      return { char: " ", fg: settings.mainColor, bg: settings.mainColor }
    }
    return { char: sym, fg: settings.textureColor, bg: settings.mainColor }
  }
  // texture mode: pattern char over bg
  return { char: "▓", fg: settings.textureColor, bg: settings.mainColor }
}

export function compositeLayers(
  layers: Layer[],
  cols: number,
  rows: number,
): Map<string, Cell> {
  const result = new Map<string, Cell>()
  for (const layer of layers) {
    if (!layer.visible) continue
    for (const [key, cell] of Object.entries(layer.cells)) {
      const [c, r] = key.split(",").map(Number)
      if (c >= 0 && c < cols && r >= 0 && r < rows) {
        result.set(key, cell)
      }
    }
  }
  return result
}

export function stampCells(
  col: number,
  row: number,
  thickness: number,
  cell: Cell,
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
        entries.push([cellKey(tc, tr), cell])
      }
    }
  }
  return entries
}

export function bresenham(
  c0: number,
  r0: number,
  c1: number,
  r1: number,
): GridPos[] {
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
    if (e2 > -dr) { err -= dr; c += sc }
    if (e2 < dc) { err += dc; r += sr }
  }
  return points
}

export function lineToStamp(
  points: GridPos[],
  thickness: number,
  cell: Cell,
  cols: number,
  rows: number,
): [string, Cell][] {
  const seen = new Set<string>()
  const result: [string, Cell][] = []
  for (const p of points) {
    for (const [key, c] of stampCells(p.col, p.row, thickness, cell, cols, rows)) {
      if (!seen.has(key)) {
        seen.add(key)
        result.push([key, c])
      }
    }
  }
  return result
}

export function rectToStamp(
  c0: number, r0: number, c1: number, r1: number,
  thickness: number,
  cell: Cell,
  cols: number,
  rows: number,
  filled: boolean,
): [string, Cell][] {
  const minC = Math.min(c0, c1)
  const maxC = Math.max(c0, c1)
  const minR = Math.min(r0, r1)
  const maxR = Math.max(r0, r1)
  const seen = new Set<string>()
  const result: [string, Cell][] = []

  const addStamp = (c: number, r: number) => {
    for (const [key, cell_] of stampCells(c, r, thickness, cell, cols, rows)) {
      if (!seen.has(key)) { seen.add(key); result.push([key, cell_]) }
    }
  }

  if (filled) {
    for (let r = minR; r <= maxR; r++)
      for (let c = minC; c <= maxC; c++) addStamp(c, r)
  } else {
    for (let c = minC; c <= maxC; c++) { addStamp(c, minR); addStamp(c, maxR) }
    for (let r = minR + 1; r < maxR; r++) { addStamp(minC, r); addStamp(maxC, r) }
  }
  return result
}

/**
 * Given a filled set of sub-cell pixel positions within a single cell
 * (each value 0.0–1.0 for x and y), pick the best Unicode block character.
 * Coverage is the fraction of the cell that should be "filled".
 */
export function pickGlyph(coverage: number): string {
  if (coverage <= 0) return " "
  if (coverage < 0.125) return "░"
  if (coverage < 0.375) return "▒"
  if (coverage < 0.625) return "▓"
  return "█"
}

/**
 * Given a line drawn at a given angle (radians), pick the best box-drawing
 * or block character to represent that direction in a single cell.
 */
export function pickLineGlyph(angleDeg: number, thickness: number): string {
  // Normalise to 0–360
  const a = ((angleDeg % 360) + 360) % 360
  const tol = 22.5

  // Horizontal: 0° (and 180°)
  if (a <= tol || a >= 360 - tol || (a >= 180 - tol && a <= 180 + tol)) {
    return thickness > 1 ? "━" : "─"
  }
  // Vertical: 90° and 270°
  if ((a >= 90 - tol && a <= 90 + tol) || (a >= 270 - tol && a <= 270 + tol)) {
    return thickness > 1 ? "┃" : "│"
  }
  // Diagonal NE/SW: 45° and 225°
  if ((a >= 45 - tol && a <= 45 + tol) || (a >= 225 - tol && a <= 225 + tol)) {
    return "╱"
  }
  // Diagonal NW/SE: 135° and 315°
  if ((a >= 135 - tol && a <= 135 + tol) || (a >= 315 - tol && a <= 315 + tol)) {
    return "╲"
  }
  // Fallback
  return "█"
}

/**
 * Given two grid positions, compute the angle in degrees of the line connecting them.
 */
export function lineAngle(c0: number, r0: number, c1: number, r1: number): number {
  const deg = Math.atan2(r1 - r0, c1 - c0) * 180 / Math.PI
  return ((deg % 360) + 360) % 360
}
