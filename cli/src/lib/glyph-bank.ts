import { pickCoverageGlyph } from "./canvas.js"

export interface GlyphTemplate {
  char: string
  mask: number
}

const SAMPLE_COLS = 4
const SAMPLE_ROWS = 8
const SAMPLE_SIZE = SAMPLE_COLS * SAMPLE_ROWS

function quadrantCovers(mask: number): (x: number, y: number) => boolean {
  return (x, y) => {
    const bit = x < 0.5
      ? y < 0.5 ? 1 : 4
      : y < 0.5 ? 2 : 8
    return (mask & bit) !== 0
  }
}

export function sampleCoverageMask(covers: (x: number, y: number) => boolean): number {
  let mask = 0
  let bit = 1
  for (let row = 0; row < SAMPLE_ROWS; row++) {
    const y = (row + 0.5) / SAMPLE_ROWS
    for (let col = 0; col < SAMPLE_COLS; col++) {
      const x = (col + 0.5) / SAMPLE_COLS
      if (covers(x, y)) mask |= bit
      bit <<= 1
    }
  }
  return mask
}

export function sampleCoverageProfile(
  covers: (x: number, y: number) => boolean,
  subdivisions = 4,
): number[] {
  const profile: number[] = []
  const samplesPerCell = subdivisions * subdivisions

  for (let row = 0; row < SAMPLE_ROWS; row++) {
    for (let col = 0; col < SAMPLE_COLS; col++) {
      let covered = 0
      for (let sy = 0; sy < subdivisions; sy++) {
        for (let sx = 0; sx < subdivisions; sx++) {
          const x = (col + (sx + 0.5) / subdivisions) / SAMPLE_COLS
          const y = (row + (sy + 0.5) / subdivisions) / SAMPLE_ROWS
          if (covers(x, y)) covered++
        }
      }
      profile.push(covered / samplesPerCell)
    }
  }

  return profile
}

function maskFromRows(rows: readonly string[]): number {
  if (rows.length !== SAMPLE_ROWS) {
    throw new Error('Expected ' + SAMPLE_ROWS + ' rows, got ' + rows.length)
  }
  let mask = 0
  let bit = 1
  for (const row of rows) {
    if (row.length !== SAMPLE_COLS) {
      throw new Error('Expected ' + SAMPLE_COLS + ' columns per row, got ' + row.length)
    }
    for (const ch of row) {
      if (ch === "1") mask |= bit
      bit <<= 1
    }
  }
  return mask
}

const blockGlyphTemplates: GlyphTemplate[] = Array.from({ length: 16 }, (_, mask) => ({
  char: pickCoverageGlyph(mask),
  mask: sampleCoverageMask(quadrantCovers(mask)),
}))

export const renderedLegacyGlyphRows = {
  "🬼": ["0000", "0000", "0000", "0000", "0000", "1000", "0000", "0000"],
  "🬽": ["0000", "0000", "0000", "0000", "0000", "1110", "0000", "0000"],
  "🬾": ["0000", "0000", "0000", "0000", "1000", "1000", "0000", "0000"],
  "🬿": ["0000", "0000", "0000", "1000", "1100", "1111", "0000", "0000"],
  "🭀": ["0000", "0000", "0000", "1000", "1000", "1100", "0000", "0000"],
  "🭁": ["0111", "1111", "1111", "1111", "1111", "1111", "0000", "0000"],
  "🭂": ["0000", "0111", "1111", "1111", "1111", "1111", "0000", "0000"],
  "🭃": ["0011", "0111", "1111", "1111", "1111", "1111", "0000", "0000"],
  "🭄": ["0000", "0001", "0011", "1111", "1111", "1111", "0000", "0000"],
  "🭅": ["0011", "0111", "0111", "1111", "1111", "1111", "0000", "0000"],
  "🭆": ["0000", "0000", "0000", "0111", "1111", "1111", "0000", "0000"],
  "🭇": ["0000", "0000", "0000", "0000", "0000", "0001", "0000", "0000"],
  "🭈": ["0000", "0000", "0000", "0000", "0000", "0111", "0000", "0000"],
  "🭉": ["0000", "0000", "0000", "0000", "0001", "0001", "0000", "0000"],
  "🭊": ["0000", "0000", "0000", "0001", "0011", "1111", "0000", "0000"],
  "🭋": ["0000", "0000", "0000", "0001", "0001", "0011", "0000", "0000"],
  "🭌": ["1110", "1111", "1111", "1111", "1111", "1111", "0000", "0000"],
  "🭍": ["0000", "1110", "1111", "1111", "1111", "1111", "0000", "0000"],
  "🭎": ["1100", "1110", "1111", "1111", "1111", "1111", "0000", "0000"],
  "🭏": ["0000", "1000", "1100", "1111", "1111", "1111", "0000", "0000"],
  "🭐": ["1100", "1110", "1110", "1111", "1111", "1111", "0000", "0000"],
  "🭑": ["0000", "0000", "0000", "1110", "1111", "1111", "0000", "0000"],
  "🭒": ["1111", "1111", "1111", "1111", "1111", "0111", "0000", "0000"],
  "🭓": ["1111", "1111", "1111", "1111", "1111", "0001", "0000", "0000"],
  "🭔": ["1111", "1111", "1111", "1111", "0111", "0111", "0000", "0000"],
  "🭕": ["1111", "1111", "1111", "0111", "0011", "0000", "0000", "0000"],
  "🭖": ["1111", "1111", "1111", "0111", "0111", "0011", "0000", "0000"],
  "🭗": ["1000", "0000", "0000", "0000", "0000", "0000", "0000", "0000"],
  "🭘": ["1111", "1000", "0000", "0000", "0000", "0000", "0000", "0000"],
  "🭙": ["1100", "1000", "0000", "0000", "0000", "0000", "0000", "0000"],
  "🭚": ["1111", "1110", "1100", "0000", "0000", "0000", "0000", "0000"],
  "🭛": ["1100", "1000", "1000", "0000", "0000", "0000", "0000", "0000"],
  "🭜": ["1111", "1111", "1111", "1000", "0000", "0000", "0000", "0000"],
  "🭝": ["1111", "1111", "1111", "1111", "1111", "1110", "0000", "0000"],
  "🭞": ["1111", "1111", "1111", "1111", "1111", "1000", "0000", "0000"],
  "🭟": ["1111", "1111", "1111", "1111", "1110", "1110", "0000", "0000"],
  "🭠": ["1111", "1111", "1111", "1110", "1100", "0000", "0000", "0000"],
  "🭡": ["1111", "1111", "1111", "1110", "1110", "1100", "0000", "0000"],
  "🭢": ["0001", "0000", "0000", "0000", "0000", "0000", "0000", "0000"],
  "🭣": ["1111", "0001", "0000", "0000", "0000", "0000", "0000", "0000"],
  "🭤": ["0011", "0001", "0000", "0000", "0000", "0000", "0000", "0000"],
  "🭥": ["1111", "0111", "0011", "0000", "0000", "0000", "0000", "0000"],
  "🭦": ["0011", "0001", "0001", "0000", "0000", "0000", "0000", "0000"],
  "🭧": ["1111", "1111", "1111", "0001", "0000", "0000", "0000", "0000"],
  "🭨": ["1111", "1111", "0111", "0011", "0111", "1111", "0000", "0000"],
  "🭩": ["0000", "0000", "1001", "1111", "1111", "1111", "0000", "0000"],
  "🭪": ["1111", "1111", "1110", "1100", "1110", "1111", "0000", "0000"],
  "🭫": ["1111", "1111", "1111", "1111", "1001", "0000", "0000", "0000"],
  "🭬": ["0000", "0000", "1000", "1100", "1000", "0000", "0000", "0000"],
  "🭭": ["1111", "1111", "0110", "0000", "0000", "0000", "0000", "0000"],
  "🭮": ["0000", "0000", "0001", "0011", "0001", "0000", "0000", "0000"],
  "🭯": ["0000", "0000", "0000", "0000", "0110", "1111", "0000", "0000"],
} as const

const legacyGlyphTemplates: GlyphTemplate[] = Object.entries(renderedLegacyGlyphRows).map(([char, rows]) => ({
  char,
  mask: maskFromRows(rows),
}))

const autoLegacyGlyphs = new Set([
  "🬿",
  "🭊",
  "🭚",
  "🭥",
  "🭬",
  "🭭",
  "🭮",
  "🭯",
])

const autoLegacyGlyphTemplates = legacyGlyphTemplates.filter((glyph) => autoLegacyGlyphs.has(glyph.char))

export const glyphTemplates: GlyphTemplate[] = [
  ...blockGlyphTemplates,
  ...autoLegacyGlyphTemplates,
]

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size))
  }
  return rows
}

export const glyphBankRows: string[][] = [
  [" ", "▘", "▝", "▀", "▖", "▌", "▚", "▛"],
  ["▗", "▞", "▐", "▜", "▄", "▙", "▟", "█"],
  ...chunk(Object.keys(renderedLegacyGlyphRows), 12),
]

export const GLYPH_SAMPLE_COLS = SAMPLE_COLS
export const GLYPH_SAMPLE_ROWS = SAMPLE_ROWS
export const GLYPH_SAMPLE_SIZE = SAMPLE_SIZE
