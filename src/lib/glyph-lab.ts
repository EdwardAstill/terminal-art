export interface GlyphChoice {
  char: string
  codepoint: string
  family: string
}

export interface GlyphExportEntry {
  char: string
  codepoint: string
  rows: string[]
}

export const GLYPH_CHOICES: GlyphChoice[] = [
  { char: "🭨", codepoint: "U+1FB68", family: "three-quarter block" },
  { char: "🬿", codepoint: "U+1FB3F", family: "diagonal wedge" },
  { char: "🭬", codepoint: "U+1FB6C", family: "quarter triangle" },
]

export const GRID_COLS = 4
export const GRID_ROWS = 8

export function createEmptyRows(): string[] {
  return Array.from({ length: GRID_ROWS }, () => "0".repeat(GRID_COLS))
}

export function rowsToMask(rows: readonly string[]): number {
  let mask = 0
  let bit = 1
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      if (rows[row]?.[col] === "1") mask |= bit
      bit <<= 1
    }
  }
  return mask
}

export function maskToRows(mask: number): string[] {
  const rows: string[] = []
  for (let row = 0; row < GRID_ROWS; row++) {
    let line = ""
    for (let col = 0; col < GRID_COLS; col++) {
      const bit = 1 << (row * GRID_COLS + col)
      line += (mask & bit) !== 0 ? "1" : "0"
    }
    rows.push(line)
  }
  return rows
}

function sampleCell(rows: readonly string[], x: number, y: number): string {
  const col = Math.min(GRID_COLS - 1, Math.max(0, Math.floor(x * GRID_COLS)))
  const row = Math.min(GRID_ROWS - 1, Math.max(0, Math.floor(y * GRID_ROWS)))
  return rows[row]?.[col] ?? "0"
}

export function rotateRows(rows: readonly string[], turns: number): string[] {
  const normalized = ((turns % 4) + 4) % 4
  if (normalized === 0) return [...rows]

  let result = [...rows]
  for (let i = 0; i < normalized; i++) {
    const next: string[] = []
    for (let row = 0; row < GRID_ROWS; row++) {
      let line = ""
      for (let col = 0; col < GRID_COLS; col++) {
        const x = (col + 0.5) / GRID_COLS
        const y = (row + 0.5) / GRID_ROWS
        const sourceX = y
        const sourceY = 1 - x
        line += sampleCell(result, sourceX, sourceY)
      }
      next.push(line)
    }
    result = next
  }
  return result
}

export function toggleCell(rows: readonly string[], rowIndex: number, colIndex: number): string[] {
  const next = [...rows]
  const line = rows[rowIndex] ?? "0".repeat(GRID_COLS)
  const chars = line.split("")
  chars[colIndex] = chars[colIndex] === "1" ? "0" : "1"
  next[rowIndex] = chars.join("")
  return next
}

export function rowsToPrettyGrid(rows: readonly string[]): string {
  return rows.join("\n")
}

export function exportGlyphBank(entries: GlyphExportEntry[]): string {
  return JSON.stringify({
    version: 1,
    sample: { cols: GRID_COLS, rows: GRID_ROWS },
    glyphs: entries.map((entry) => ({
      ...entry,
      rotations: [
        { degrees: 0, rows: entry.rows },
        { degrees: 90, rows: rotateRows(entry.rows, 1) },
        { degrees: 180, rows: rotateRows(entry.rows, 2) },
        { degrees: 270, rows: rotateRows(entry.rows, 3) },
      ],
    })),
  }, null, 2)
}
