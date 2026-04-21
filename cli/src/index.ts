#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, resolve } from "node:path"
import { bresenham, cellKey, catmullRom, lineAngle, pickCoverageGlyph, pickLineGlyph, rasterCircle, rasterEllipse, rasterLine, rasterPolyline } from "./lib/canvas.js"
import { glyphBankRows, glyphTemplates, sampleCoverageMask } from "./lib/glyph-bank.js"
import { createBlankState, deserialize, serialize, type FileState } from "./lib/file.js"
import { exportAnsi, exportAscii, cellFromParts } from "./lib/render.js"
import type { CanvasSize, Cell, Layer, LayerKind } from "./lib/types.js"

type ArgMap = Map<string, string | boolean>
type FitScoreMode = "simple" | "balanced" | "overlap" | "edge"

interface ParsedCommand {
  args: string[]
  flags: ArgMap
}

interface ExecContext {
  baseDir: string
}

function printUsage(): void {
  process.stdout.write(`term-art

Usage:
  term-art init [--cols N --rows N] [--out file.termart]
  term-art info <file.termart>
  term-art resize <file.termart> --cols N --rows N [--out file.termart]
  term-art demo [ansi|ascii] [--out file.termart]
  term-art run <script.termartcli>
  term-art glyphs
  term-art <file.termart> <op> ...           default Unicode mode
  term-art ansi <file.termart> put x y --char X --fg #hex --bg #hex [--layer id]
  term-art ansi <file.termart> text x y "hello" --fg #hex --bg #hex [--layer id]
  term-art ansi <file.termart> line x1 y1 x2 y2 --char X --fg #hex --bg #hex [--thickness N] [--layer id]
  term-art ansi <file.termart> rect x1 y1 x2 y2 --char X --fg #hex --bg #hex [--fill] [--layer id]
  term-art ansi <file.termart> fill x1 y1 x2 y2 --char X --fg #hex --bg #hex [--layer id]
  term-art ansi <file.termart> subfill x1 y1 x2 y2 --fg #hex --bg #hex [--layer id]
  term-art ansi <file.termart> triangle x1 y1 x2 y2 x3 y3 --char X --fg #hex --bg #hex [--layer id]
  term-art ansi <file.termart> circle cx cy r --char X --fg #hex --bg #hex [--fill] [--aspect-y N] [--layer id]
  term-art ansi <file.termart> ellipse cx cy rx ry --char X --fg #hex --bg #hex [--fill] [--aspect-y N] [--layer id]
  term-art ansi <file.termart> spline x1 y1 x2 y2 x3 y3 ... --char X --fg #hex --bg #hex [--thickness N] [--layer id]
  term-art ansi <file.termart> clear [x1 y1 x2 y2] [--layer id] [--all]
  term-art <file.termart> put x y [--char X] [--layer id]
  term-art <file.termart> text x y "hello" [--char X] [--layer id]
  term-art <file.termart> line x1 y1 x2 y2 [--char auto|X] [--thickness N] [--layer id]
  term-art <file.termart> rect x1 y1 x2 y2 [--fill] [--char X] [--thickness N] [--layer id]
  term-art <file.termart> fill x1 y1 x2 y2 [--char X] [--layer id]
  term-art <file.termart> subfill x1 y1 x2 y2 [--char X] [--layer id]
  term-art <file.termart> triangle x1 y1 x2 y2 x3 y3 [--char X] [--layer id]
  term-art <file.termart> circle cx cy r [--fill] [--char X] [--aspect-y N] [--layer id]
  term-art <file.termart> ellipse cx cy rx ry [--fill] [--char X] [--aspect-y N] [--layer id]
  term-art <file.termart> spline x1 y1 x2 y2 x3 y3 ... [--char auto|X] [--thickness N] [--layer id]
  term-art <file.termart> clear [x1 y1 x2 y2] [--layer id] [--all]
  term-art export ansi <file.termart> [--out file.txt]
  term-art export ascii <file.termart> [--out file.txt]

Notes:
  - Coordinates are grid based: x = column, y = row.
  - 0,0 is top-left.
  - init creates a blank .termart file with both ansi and unicode layers.
  - ANSI mode is strict: explicit char plus fg/bg on draw commands.
  - Script mode runs one command per line, with quoted strings supported.
  - circle and ellipse use sample-based sub-cell fitting on edges.
  - circle and ellipse accept --aspect-y to tune terminal-cell correction. Default: 1.3.
  - --print overrides --out and writes the result to stdout.
`)
}

function exitWith(message: string, code = 1): never {
  process.stderr.write(`${message}\n`)
  process.exit(code)
}

function parseCommand(argv: string[]): ParsedCommand {
  const args: string[] = []
  const flags: ArgMap = new Map()

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (!token.startsWith("-")) {
      args.push(token)
      continue
    }

    if (token.startsWith("--")) {
      const [name, inlineValue] = token.slice(2).split("=", 2)
      if (inlineValue !== undefined) {
        flags.set(name, inlineValue)
        continue
      }
      const next = argv[i + 1]
      if (next !== undefined && !next.startsWith("-")) {
        flags.set(name, next)
        i++
      } else {
        flags.set(name, true)
      }
      continue
    }

    const shorts = token.slice(1).split("")
    for (let j = 0; j < shorts.length; j++) {
      const short = shorts[j]
      if (short === "o") {
        const next = argv[i + 1]
        if (!next || next.startsWith("-")) exitWith("Missing value for -o")
        flags.set("out", next)
        i++
        break
      }
      flags.set(short, true)
    }
  }

  return { args, flags }
}

function flagString(flags: ArgMap, name: string, fallback = ""): string {
  const value = flags.get(name)
  return typeof value === "string" ? value : fallback
}

function flagBool(flags: ArgMap, name: string): boolean {
  return flags.get(name) === true
}

function shouldPrint(flags: ArgMap): boolean {
  return flagBool(flags, "print")
}

function outputTarget(flags: ArgMap, fallback = "-"): string {
  return shouldPrint(flags) ? "-" : flagString(flags, "out", fallback)
}

function flagNumber(flags: ArgMap, name: string, fallback: number): number {
  const value = flags.get(name)
  if (typeof value !== "string") return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) exitWith(`Invalid value for --${name}: ${value}`)
  return parsed
}

function readFitScoreMode(flags: ArgMap): FitScoreMode {
  const value = flagString(flags, "fit-score", "simple")
  if (value === "simple" || value === "balanced" || value === "overlap" || value === "edge") return value
  exitWith(`Invalid --fit-score: ${value}`)
}

function readCoord(value: string, label: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) exitWith(`Invalid ${label}: ${value}`)
  return parsed
}

function readCoordFloat(value: string, label: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) exitWith(`Invalid ${label}: ${value}`)
  return parsed
}

function resolvePathLike(input: string, baseDir: string): string {
  return isAbsolute(input) ? input : resolve(baseDir, input)
}

function tokenizeScriptLine(line: string): string[] {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith("#")) return []

  const tokens: string[] = []
  let current = ""
  let quote: string | null = null
  let escape = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]

    if (escape) {
      current += ch
      escape = false
      continue
    }

    if (ch === "\\") {
      escape = true
      continue
    }

    if (quote) {
      if (ch === quote) {
        quote = null
        continue
      }
      current += ch
      continue
    }

    if (ch === "\"" || ch === "'") {
      quote = ch
      continue
    }

    if (/\s/.test(ch)) {
      if (current.length > 0) {
        tokens.push(current)
        current = ""
      }
      continue
    }

    current += ch
  }

  if (quote) exitWith("Unterminated quote in script line")
  if (escape) exitWith("Dangling escape in script line")
  if (current.length > 0) tokens.push(current)
  return tokens
}

function getLayerById(layers: Layer[], layerId: string): Layer {
  const layer = layers.find((entry) => entry.id === layerId)
  if (!layer) exitWith(`Layer not found: ${layerId}`)
  return layer
}

function selectLayer(layers: Layer[], kind: LayerKind, layerId?: string): Layer {
  if (layerId) {
    const layer = getLayerById(layers, layerId)
    if (layer.kind !== kind) exitWith(`Layer ${layerId} is not ${kind}`)
    return layer
  }

  const visible = [...layers].reverse().find((layer) => layer.kind === kind && layer.visible)
  if (visible) return visible

  const existing = [...layers].reverse().find((layer) => layer.kind === kind)
  if (existing) return existing

  const id = `${kind}-${Date.now()}`
  const layer: Layer = { id, name: "layer 1", kind, visible: true, locked: false, cells: {} }
  layers.push(layer)
  return layer
}

function getModeLayers(layers: Layer[], kind: LayerKind, layerId?: string): Layer[] {
  if (layerId) {
    return [selectLayer(layers, kind, layerId)]
  }
  return layers.filter((layer) => layer.kind === kind)
}

function setCell(layer: Layer, col: number, row: number, cell: Cell): void {
  layer.cells[cellKey(col, row)] = cell
}

function clearCell(layer: Layer, col: number, row: number): void {
  delete layer.cells[cellKey(col, row)]
}

function ensureInCanvas(canvas: CanvasSize, col: number, row: number): boolean {
  return col >= 0 && col < canvas.cols && row >= 0 && row < canvas.rows
}

function writeText(
  layer: Layer,
  canvas: CanvasSize,
  x: number,
  y: number,
  text: string,
  cell: Cell,
): void {
  let col = x
  let row = y
  for (const ch of text) {
    if (ch === "\n") {
      row += 1
      col = x
      continue
    }
    if (ensureInCanvas(canvas, col, row)) {
      setCell(layer, col, row, { ...cell, char: ch })
    }
    col += 1
  }
}

function drawPoint(layer: Layer, canvas: CanvasSize, col: number, row: number, cell: Cell): void {
  if (!ensureInCanvas(canvas, col, row)) return
  setCell(layer, col, row, cell)
}

function drawLine(
  layer: Layer,
  canvas: CanvasSize,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  thickness: number,
  cell: Cell,
): void {
  const points = new Set<string>()
  const half = Math.floor(thickness / 2)
  for (const point of bresenham(x1, y1, x2, y2)) {
    for (let dy = -half; dy <= half; dy++) {
      for (let dx = -half; dx <= half; dx++) {
        const col = point.col + dx
        const row = point.row + dy
        if (!ensureInCanvas(canvas, col, row)) continue
        points.add(cellKey(col, row))
      }
    }
  }
  for (const key of points) {
    const [col, row] = key.split(",").map(Number)
    setCell(layer, col, row, cell)
  }
}

function drawRectOutline(
  layer: Layer,
  canvas: CanvasSize,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  thickness: number,
  cell: Cell,
): void {
  const minX = Math.min(x1, x2)
  const maxX = Math.max(x1, x2)
  const minY = Math.min(y1, y2)
  const maxY = Math.max(y1, y2)
  const top = bresenham(minX, minY, maxX, minY)
  const bottom = bresenham(minX, maxY, maxX, maxY)
  const left = bresenham(minX, minY, minX, maxY)
  const right = bresenham(maxX, minY, maxX, maxY)
  drawLine(layer, canvas, minX, minY, maxX, minY, thickness, cell)
  drawLine(layer, canvas, minX, maxY, maxX, maxY, thickness, cell)
  drawLine(layer, canvas, minX, minY, minX, maxY, thickness, cell)
  drawLine(layer, canvas, maxX, minY, maxX, maxY, thickness, cell)
  for (const point of [...top, ...bottom, ...left, ...right]) {
    if (ensureInCanvas(canvas, point.col, point.row)) {
      setCell(layer, point.col, point.row, cell)
    }
  }
}

function drawRectFill(
  layer: Layer,
  canvas: CanvasSize,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  cell: Cell,
): void {
  const minX = Math.min(x1, x2)
  const maxX = Math.max(x1, x2)
  const minY = Math.min(y1, y2)
  const maxY = Math.max(y1, y2)
  for (let row = minY; row <= maxY; row++) {
    for (let col = minX; col <= maxX; col++) {
      if (ensureInCanvas(canvas, col, row)) setCell(layer, col, row, cell)
    }
  }
}

function clearRect(
  layer: Layer,
  canvas: CanvasSize,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): void {
  const minX = Math.min(x1, x2)
  const maxX = Math.max(x1, x2)
  const minY = Math.min(y1, y2)
  const maxY = Math.max(y1, y2)
  for (let row = minY; row <= maxY; row++) {
    for (let col = minX; col <= maxX; col++) {
      if (ensureInCanvas(canvas, col, row)) clearCell(layer, col, row)
    }
  }
}

function parseRectArgs(args: string[], startIndex = 2): [number, number, number, number] {
  if (args.length < startIndex + 4) exitWith("Missing rectangle coordinates")
  return [
    readCoord(args[startIndex], "x1"),
    readCoord(args[startIndex + 1], "y1"),
    readCoord(args[startIndex + 2], "x2"),
    readCoord(args[startIndex + 3], "y2"),
  ]
}

function requireAnsiStyle(flags: ArgMap, drawLabel: string): { fg: string; bg: string; char: string } {
  const char = flagString(flags, "char", "")
  const fg = flagString(flags, "fg", "")
  const bg = flagString(flags, "bg", "")
  if (!char || char === "auto") exitWith(`ANSI ${drawLabel} requires --char`)
  if (!fg) exitWith(`ANSI ${drawLabel} requires --fg`)
  if (!bg) exitWith(`ANSI ${drawLabel} requires --bg`)
  return { fg, bg, char }
}

function buildAsciiCell(flags: ArgMap, fallbackChar = "█"): Cell {
  const char = flagString(flags, "char", fallbackChar)
  const fg = flagString(flags, "fg", "#000000")
  const bgValue = flags.get("bg")
  const bg = typeof bgValue === "string" ? bgValue : null
  return cellFromParts(char, fg, bg)
}

function buildAnsiCell(flags: ArgMap): Cell {
  const { fg, bg, char } = requireAnsiStyle(flags, "draw")
  return cellFromParts(char, fg, bg)
}

function buildStyleCell(flags: ArgMap, mode: LayerKind): Cell {
  const fg = mode === "ansi" ? flagString(flags, "fg", "") : flagString(flags, "fg", "#000000")
  const bgValue = flags.get("bg")
  const bg = typeof bgValue === "string" ? bgValue : null
  if (mode === "ansi" && !fg) exitWith("ANSI text requires --fg")
  if (mode === "ansi" && bg === null) exitWith("ANSI text requires --bg")
  return cellFromParts(" ", fg || "#000000", bg)
}

function buildLineCellForAscii(x1: number, y1: number, x2: number, y2: number, thickness: number, flags: ArgMap): Cell {
  const charFlag = flagString(flags, "char", "")
  const fg = flagString(flags, "fg", "#000000")
  const bgValue = flags.get("bg")
  const bg = typeof bgValue === "string" ? bgValue : null
  const char = charFlag && charFlag !== "auto" ? charFlag : pickLineGlyph(lineAngle(x1, y1, x2, y2), thickness)
  return cellFromParts(char, fg, bg)
}

function createAnsiDemoState(): FileState {
  const state = createBlankState({ cols: 32, rows: 12 })
  const layer = selectLayer(state.layers, "ansi", "ansi-1")

  drawRectFill(layer, state.canvas, 0, 0, 31, 11, cellFromParts("@", "#d9d9d9", "#101827"))
  drawRectFill(layer, state.canvas, 2, 2, 29, 9, cellFromParts("·", "#60a5fa", "#1f2937"))
  drawRectFill(layer, state.canvas, 4, 3, 27, 8, cellFromParts("█", "#f9fafb", "#7c3aed"))
  drawSubcellTriangle(layer, state.canvas, 5.5, 8.5, 15.5, 2.5, 25.5, 8.5, cellFromParts(" ", "#f97316", "#1f2937"))
  writeText(layer, state.canvas, 10, 5, "ANSI", cellFromParts(" ", "#fde047", "#7c3aed"))
  writeText(layer, state.canvas, 8, 7, "colored demo", cellFromParts(" ", "#34d399", "#1f2937"))

  return state
}

function createAsciiDemoState(): FileState {
  const state = createBlankState({ cols: 24, rows: 12 })
  const layer = selectLayer(state.layers, "ascii", "ascii-1")

  drawAsciiRectAuto(layer, state.canvas, 2, 3, 21, 10, 1, new Map())
  drawLine(layer, state.canvas, 2, 10, 11, 3, 1, cellFromParts("╲", "#ffffff", null))
  drawLine(layer, state.canvas, 21, 10, 11, 3, 1, cellFromParts("╱", "#ffffff", null))
  drawLine(layer, state.canvas, 7, 7, 15, 7, 1, cellFromParts("─", "#ffffff", null))
  drawLine(layer, state.canvas, 11, 3, 11, 7, 1, cellFromParts("│", "#ffffff", null))
  drawSubcellTriangle(layer, state.canvas, 4.5, 9.5, 11.5, 2.5, 18.5, 9.5, cellFromParts(" ", "#ffffff", null))

  return state
}

function drawAsciiRectAuto(
  layer: Layer,
  canvas: CanvasSize,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  thickness: number,
  flags: ArgMap,
): void {
  const fg = flagString(flags, "fg", "#000000")
  const bgValue = flags.get("bg")
  const bg = typeof bgValue === "string" ? bgValue : null
  const minX = Math.min(x1, x2)
  const maxX = Math.max(x1, x2)
  const minY = Math.min(y1, y2)
  const maxY = Math.max(y1, y2)
  const cornerCells = [
    [minX, minY, "┌"],
    [maxX, minY, "┐"],
    [minX, maxY, "└"],
    [maxX, maxY, "┘"],
  ] as const
  const horizontal = cellFromParts("─", fg, bg)
  const vertical = cellFromParts("│", fg, bg)
  const corners = new Map<string, Cell>(cornerCells.map(([col, row, char]) => [`${col},${row}`, cellFromParts(char, fg, bg)]))

  drawLine(layer, canvas, minX, minY, maxX, minY, thickness, horizontal)
  drawLine(layer, canvas, minX, maxY, maxX, maxY, thickness, horizontal)
  drawLine(layer, canvas, minX, minY, minX, maxY, thickness, vertical)
  drawLine(layer, canvas, maxX, minY, maxX, maxY, thickness, vertical)

  for (const [key, cell] of corners) {
    const [col, row] = key.split(",").map(Number)
    setCell(layer, col, row, cell)
  }
}

function overlap1D(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0))
}

function pointInTriangle(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): boolean {
  const s = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): number =>
    (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3)

  const d1 = s(px, py, ax, ay, bx, by)
  const d2 = s(px, py, bx, by, cx, cy)
  const d3 = s(px, py, cx, cy, ax, ay)
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0
  return !(hasNeg && hasPos)
}

function drawSubcellFill(
  layer: Layer,
  canvas: CanvasSize,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  cell: Cell,
  charOverride?: string,
): void {
  const minX = Math.min(x1, x2)
  const maxX = Math.max(x1, x2)
  const minY = Math.min(y1, y2)
  const maxY = Math.max(y1, y2)
  const startCol = Math.floor(minX)
  const endCol = Math.ceil(maxX) - 1
  const startRow = Math.floor(minY)
  const endRow = Math.ceil(maxY) - 1

  for (let row = startRow; row <= endRow; row++) {
    for (let col = startCol; col <= endCol; col++) {
      if (!ensureInCanvas(canvas, col, row)) continue

      const quadrants = [
        [col, row, col + 0.5, row + 0.5, 1],
        [col + 0.5, row, col + 1, row + 0.5, 2],
        [col, row + 0.5, col + 0.5, row + 1, 4],
        [col + 0.5, row + 0.5, col + 1, row + 1, 8],
      ] as const

      let mask = 0
      for (const [qx0, qy0, qx1, qy1, bit] of quadrants) {
        const overlap = overlap1D(minX, maxX, qx0, qx1) * overlap1D(minY, maxY, qy0, qy1)
        if (overlap > 0) mask |= bit
      }

      if (mask === 0) continue
      const char = charOverride && charOverride !== "auto" ? charOverride : pickCoverageGlyph(mask)
      setCell(layer, col, row, { ...cell, char })
    }
  }
}

function drawSubcellTriangle(
  layer: Layer,
  canvas: CanvasSize,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  cell: Cell,
  charOverride?: string,
  scoreMode: FitScoreMode = "simple",
): void {
  drawCoverageShape(
    layer,
    canvas,
    Math.min(ax, bx, cx),
    Math.min(ay, by, cy),
    Math.max(ax, bx, cx),
    Math.max(ay, by, cy),
    cell,
    (x, y) => pointInTriangle(x, y, ax, ay, bx, by, cx, cy),
    charOverride,
    scoreMode,
  )
}

function drawSubcellShape(
  layer: Layer,
  canvas: CanvasSize,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  cell: Cell,
  matches: (x: number, y: number) => boolean,
  charOverride?: string,
): void {
  const startCol = Math.floor(minX)
  const endCol = Math.ceil(maxX) - 1
  const startRow = Math.floor(minY)
  const endRow = Math.ceil(maxY) - 1
  for (let row = startRow; row <= endRow; row++) {
    for (let col = startCol; col <= endCol; col++) {
      if (!ensureInCanvas(canvas, col, row)) continue
      const quadrants = [
        [col + 0.25, row + 0.25, 1],
        [col + 0.75, row + 0.25, 2],
        [col + 0.25, row + 0.75, 4],
        [col + 0.75, row + 0.75, 8],
      ] as const
      let mask = 0
      for (const [px, py, bit] of quadrants) {
        if (matches(px, py)) mask |= bit
      }
      if (mask === 0) continue
      const char = charOverride && charOverride !== "auto" ? charOverride : pickCoverageGlyph(mask)
      setCell(layer, col, row, { ...cell, char })
    }
  }
}

function scoreGlyph(target: boolean, covered: boolean, mode: FitScoreMode): number {
  if (mode === "simple") {
    if (target && covered) return 2
    if (!target && covered) return -1
    if (target && !covered) return -3
    return 0
  }

  if (mode === "balanced") {
    if (target && covered) return 3
    if (!target && covered) return -3
    if (target && !covered) return -4
    return 1
  }

  if (mode === "overlap") {
    if (target && covered) return 5
    if (!target && covered) return -4
    if (target && !covered) return -5
    return 1
  }

  if (target && covered) return 4
  if (!target && covered) return -6
  if (target && !covered) return -5
  return 2
}

function bestGlyphForCoverage(matches: (x: number, y: number) => boolean, mode: FitScoreMode): string {
  let bestChar = " "
  let bestScore = Number.NEGATIVE_INFINITY
  const targetMask = sampleCoverageMask(matches)
  for (const glyph of glyphTemplates) {
    let score = 0
    let bit = 1
    for (let i = 0; i < 32; i++) {
      const target = (targetMask & bit) !== 0
      const covered = (glyph.mask & bit) !== 0
      score += scoreGlyph(target, covered, mode)
      bit <<= 1
    }
    if (score > bestScore) {
      bestScore = score
      bestChar = glyph.char
    }
  }

  return bestChar
}

function drawCoverageShape(
  layer: Layer,
  canvas: CanvasSize,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  cell: Cell,
  matches: (x: number, y: number) => boolean,
  charOverride?: string,
  scoreMode: FitScoreMode = "simple",
): void {
  const startCol = Math.floor(minX)
  const endCol = Math.ceil(maxX) - 1
  const startRow = Math.floor(minY)
  const endRow = Math.ceil(maxY) - 1

  for (let row = startRow; row <= endRow; row++) {
    for (let col = startCol; col <= endCol; col++) {
      if (!ensureInCanvas(canvas, col, row)) continue
      const cellMatches = (x: number, y: number) => matches(col + x, row + y)
      if (sampleCoverageMask(cellMatches) === 0) continue
      const char = charOverride && charOverride !== "auto" ? charOverride : bestGlyphForCoverage(cellMatches, scoreMode)
      if (char === " ") continue
      setCell(layer, col, row, { ...cell, char })
    }
  }
}

function drawTriangleStroke(
  layer: Layer,
  canvas: CanvasSize,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  thickness: number,
  cell: Cell,
): void {
  drawLine(layer, canvas, ax, ay, bx, by, thickness, cell)
  drawLine(layer, canvas, bx, by, cx, cy, thickness, cell)
  drawLine(layer, canvas, cx, cy, ax, ay, thickness, cell)
}

function drawSubcellCircle(
  layer: Layer,
  canvas: CanvasSize,
  cx: number,
  cy: number,
  radius: number,
  aspectY: number,
  cell: Cell,
  thickness: number,
  filled: boolean,
  charOverride?: string,
  scoreMode: FitScoreMode = "simple",
): void {
  if (filled) {
    drawCoverageShape(
      layer,
      canvas,
      cx - radius - thickness,
      cy - radius - thickness,
      cx + radius + thickness,
      cy + radius + thickness,
      cell,
      (x, y) => Math.hypot(x - cx, (y - cy) * aspectY) <= radius,
      charOverride,
      scoreMode,
    )
    return
  }

  drawCoverageShape(
    layer,
    canvas,
    cx - radius - thickness,
    cy - radius - thickness,
    cx + radius + thickness,
    cy + radius + thickness,
    cell,
    (x, y) => {
      const dist = Math.hypot(x - cx, (y - cy) * aspectY)
      const inner = Math.max(0, radius - thickness / 2)
      const outer = radius + thickness / 2
      return dist >= inner && dist <= outer
    },
    charOverride,
    scoreMode,
  )
}

function drawSubcellEllipse(
  layer: Layer,
  canvas: CanvasSize,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  aspectY: number,
  cell: Cell,
  thickness: number,
  filled: boolean,
  charOverride?: string,
  scoreMode: FitScoreMode = "simple",
): void {
  if (filled) {
    drawCoverageShape(
      layer,
      canvas,
      cx - rx - thickness,
      cy - ry - thickness,
      cx + rx + thickness,
      cy + ry + thickness,
      cell,
      (x, y) => {
        const dx = (x - cx) / rx
        const dy = ((y - cy) * aspectY) / ry
        return dx * dx + dy * dy <= 1
      },
      charOverride,
      scoreMode,
    )
    return
  }

  drawCoverageShape(
    layer,
    canvas,
    cx - rx - thickness,
    cy - ry - thickness,
    cx + rx + thickness,
    cy + ry + thickness,
    cell,
    (x, y) => {
      const ringPad = thickness / Math.max(rx, ry, 1)
      const inner = Math.max(0, 1 - ringPad)
      const outer = 1 + ringPad
      const adjusted = ((x - cx) / rx) ** 2 + ((((y - cy) * aspectY) / ry) ** 2)
      return adjusted >= inner * inner && adjusted <= outer * outer
    },
    charOverride,
    scoreMode,
  )
}

async function loadState(path: string): Promise<FileState> {
  const text = await readFile(path, "utf8")
  return deserialize(text)
}

async function writeState(path: string, state: FileState): Promise<void> {
  await writeFile(path, serialize(state), "utf8")
}

async function execute(argv: string[], context: ExecContext): Promise<void> {
  const raw = argv
  if (raw.length === 0 || raw.includes("--help") || raw.includes("-h")) {
    printUsage()
    return
  }

  const [command, ...rest] = raw
  const { args, flags } = parseCommand(rest)

  if (command === "glyphs") {
    for (const row of glyphBankRows) {
      process.stdout.write(`${row.join(" ")}\n`)
    }
    return
  }

  if (command === "run") {
    const scriptArg = args[0]
    if (!scriptArg) exitWith("Missing script file path")
    const scriptPath = resolvePathLike(scriptArg, context.baseDir)
    const scriptDir = dirname(scriptPath)
    const source = await readFile(scriptPath, "utf8")
    const lines = source.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      const tokens = tokenizeScriptLine(lines[i])
      if (tokens.length === 0) continue
      try {
        await execute(tokens, { baseDir: scriptDir })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        exitWith(`Script ${scriptArg}:${i + 1}: ${message}`)
      }
    }
    return
  }

  if (command === "demo") {
    const mode = args[0] === "ascii" ? "ascii" : "ansi"
    const out = outputTarget(flags, "-")
    const state = mode === "ascii" ? createAsciiDemoState() : createAnsiDemoState()
    if (out === "-") {
      process.stdout.write(mode === "ascii" ? exportAscii(state.layers, state.canvas) : exportAnsi(state.layers, state.canvas))
    } else {
      await writeState(resolvePathLike(out, context.baseDir), state)
    }
    return
  }

  if (command === "init") {
    const cols = flagNumber(flags, "cols", 80)
    const rows = flagNumber(flags, "rows", 24)
    const out = outputTarget(flags, "untitled.termart")
    const state = createBlankState({ cols, rows })
    if (out === "-") {
      process.stdout.write(serialize(state))
    } else {
      await writeState(resolvePathLike(out, context.baseDir), state)
    }
    return
  }

  if (command === "info") {
    const file = args[0]
    if (!file) exitWith("Missing file path")
    const state = await loadState(resolvePathLike(file, context.baseDir))
    const counts = {
      ansi: state.layers.filter((layer) => layer.kind === "ansi").length,
      ascii: state.layers.filter((layer) => layer.kind === "ascii").length,
    }
    process.stdout.write([
      `file: ${file}`,
      `canvas: ${state.canvas.cols}x${state.canvas.rows}`,
      `layers: ${state.layers.length} (ansi ${counts.ansi}, ascii ${counts.ascii})`,
      `images: ${state.images.length}`,
    ].join("\n") + "\n")
    return
  }

  if (command === "resize") {
    const file = args[0]
    if (!file) exitWith("Missing file path")
    const cols = flagNumber(flags, "cols", NaN)
    const rows = flagNumber(flags, "rows", NaN)
    if (!Number.isFinite(cols) || !Number.isFinite(rows)) exitWith("resize needs --cols and --rows")
    const state = await loadState(resolvePathLike(file, context.baseDir))
    const next: FileState = {
      ...state,
      canvas: { cols, rows },
      layers: state.layers.map((layer) => {
        const cells: Record<string, Cell> = {}
        for (const [key, cell] of Object.entries(layer.cells)) {
          const [col, row] = key.split(",").map(Number)
          if (ensureInCanvas({ cols, rows }, col, row)) cells[key] = cell
        }
        return { ...layer, cells }
      }),
    }
    const out = outputTarget(flags, file)
    if (out === "-") {
      process.stdout.write(serialize(next))
    } else {
      await writeState(resolvePathLike(out, context.baseDir), next)
    }
    return
  }

  if (command === "export") {
    const format = args[0]
    const file = args[1]
    if (!format || !file) exitWith("export needs a format and file path")
    const state = await loadState(resolvePathLike(file, context.baseDir))
    const out = outputTarget(flags, "-")
    const text = format === "ansi"
      ? exportAnsi(state.layers, state.canvas)
      : format === "ascii"
      ? exportAscii(state.layers, state.canvas)
      : null
    if (text === null) exitWith(`Unknown export format: ${format}`)
    if (out === "-") {
      process.stdout.write(text)
    } else {
      await writeFile(resolvePathLike(out, context.baseDir), text, "utf8")
    }
    return
  }

  const topLevel = new Set(["init", "info", "resize", "demo", "run", "export", "ansi", "ascii", "unicode", "glyphs"])
  if (!topLevel.has(command)) {
    rest.unshift(command)
    await execute(["unicode", ...rest], context)
    return
  }

  if (command === "ansi" || command === "ascii" || command === "unicode") {
    const file = args[0]
    const op = args[1]
    if (!file || !op) exitWith(`${command} needs a file and operation`)

    const filePath = resolvePathLike(file, context.baseDir)
    const state = await loadState(filePath)
    const mode: LayerKind = command === "ansi" ? "ansi" : "ascii"
    const unicodeMode = command === "unicode"
    const layerId = flagString(flags, "layer", "")
    const thickness = Math.max(1, flagNumber(flags, "thickness", 1))
    const aspectY = Math.max(0.1, flagNumber(flags, "aspect-y", 1.3))
    const fitScore = readFitScoreMode(flags)
    const all = flagBool(flags, "all")
    const subcell = flagBool(flags, "subcell")
    const layer = selectLayer(state.layers, mode, layerId || undefined)

    if (op === "clear") {
      if (args.length === 6) {
        const [x1, y1, x2, y2] = parseRectArgs(args)
        const targets = all ? getModeLayers(state.layers, mode) : getModeLayers(state.layers, mode, layerId || undefined)
        for (const layer of targets) clearRect(layer, state.canvas, x1, y1, x2, y2)
      } else {
        const targets = all ? getModeLayers(state.layers, mode) : getModeLayers(state.layers, mode, layerId || undefined)
        for (const layer of targets) layer.cells = {}
      }
    } else if (op === "put") {
      if (args.length < 4) exitWith(`${command} put needs x y`)
      const x = readCoord(args[2], "x")
      const y = readCoord(args[3], "y")
      const layer = selectLayer(state.layers, mode, layerId || undefined)
      if (mode === "ansi") {
        const cell = buildAnsiCell(flags)
        drawPoint(layer, state.canvas, x, y, cell)
      } else {
        const cell = buildAsciiCell(flags)
        drawPoint(layer, state.canvas, x, y, cell)
      }
    } else if (op === "text") {
      if (args.length < 4) exitWith(`${command} text needs x y text`)
      const x = readCoord(args[2], "x")
      const y = readCoord(args[3], "y")
      const text = args.slice(4).join(" ")
      if (!text) exitWith(`${command} text needs content`)
      const layer = selectLayer(state.layers, mode, layerId || undefined)
      const cell = buildStyleCell(flags, mode)
      writeText(layer, state.canvas, x, y, text, cell)
    } else if (op === "line") {
      if (args.length < 6) exitWith(`${command} line needs x1 y1 x2 y2`)
      const x1 = readCoord(args[2], "x1")
      const y1 = readCoord(args[3], "y1")
      const x2 = readCoord(args[4], "x2")
      const y2 = readCoord(args[5], "y2")
      const layer = selectLayer(state.layers, mode, layerId || undefined)
      if (mode === "ansi") {
        const cell = buildAnsiCell(flags)
        drawLine(layer, state.canvas, x1, y1, x2, y2, thickness, cell)
      } else {
        const cell = buildLineCellForAscii(x1, y1, x2, y2, thickness, flags)
        drawLine(layer, state.canvas, x1, y1, x2, y2, thickness, cell)
      }
    } else if (op === "rect") {
      if (args.length < 6) exitWith(`${command} rect needs x1 y1 x2 y2`)
      const x1 = readCoord(args[2], "x1")
      const y1 = readCoord(args[3], "y1")
      const x2 = readCoord(args[4], "x2")
      const y2 = readCoord(args[5], "y2")
      const layer = selectLayer(state.layers, mode, layerId || undefined)
      const fill = flagBool(flags, "fill")
      if (mode === "ansi") {
        const cell = buildAnsiCell(flags)
        if (fill) drawRectFill(layer, state.canvas, x1, y1, x2, y2, cell)
        else drawRectOutline(layer, state.canvas, x1, y1, x2, y2, thickness, cell)
      } else {
        const charFlag = flagString(flags, "char", "")
        if (fill) {
          const cell = buildAsciiCell(flags)
          drawRectFill(layer, state.canvas, x1, y1, x2, y2, cell)
        } else if (!unicodeMode && charFlag && charFlag !== "auto") {
          const cell = buildAsciiCell(flags)
          drawRectOutline(layer, state.canvas, x1, y1, x2, y2, thickness, cell)
        } else {
          drawAsciiRectAuto(layer, state.canvas, x1, y1, x2, y2, thickness, flags)
        }
      }
    } else if (op === "fill" || op === "subfill") {
      if (args.length < 6) exitWith(`${command} fill needs x1 y1 x2 y2`)
      const wantsSubcell = subcell || op === "subfill"
      const x1 = wantsSubcell ? readCoordFloat(args[2], "x1") : readCoord(args[2], "x1")
      const y1 = wantsSubcell ? readCoordFloat(args[3], "y1") : readCoord(args[3], "y1")
      const x2 = wantsSubcell ? readCoordFloat(args[4], "x2") : readCoord(args[4], "x2")
      const y2 = wantsSubcell ? readCoordFloat(args[5], "y2") : readCoord(args[5], "y2")
      const layer = selectLayer(state.layers, mode, layerId || undefined)
      if (wantsSubcell) {
        const fg = mode === "ansi" ? flagString(flags, "fg", "") : flagString(flags, "fg", "#000000")
        const bgValue = flags.get("bg")
        const bg = typeof bgValue === "string" ? bgValue : null
        if (mode === "ansi" && !fg) exitWith("ANSI subfill requires --fg")
        if (mode === "ansi" && bg === null) exitWith("ANSI subfill requires --bg")
        const charFlag = flagString(flags, "char", "")
        const cell = cellFromParts(" ", fg || "#000000", bg)
        drawSubcellFill(layer, state.canvas, x1, y1, x2, y2, cell, charFlag)
      } else {
        const cell = mode === "ansi" ? buildAnsiCell(flags) : buildAsciiCell(flags)
        drawRectFill(layer, state.canvas, x1, y1, x2, y2, cell)
      }
    } else if (op === "triangle") {
      if (args.length < 8) exitWith(`${command} triangle needs x1 y1 x2 y2 x3 y3`)
      const ax = readCoordFloat(args[2], "x1")
      const ay = readCoordFloat(args[3], "y1")
      const bx = readCoordFloat(args[4], "x2")
      const by = readCoordFloat(args[5], "y2")
      const cx = readCoordFloat(args[6], "x3")
      const cy = readCoordFloat(args[7], "y3")
      const layer = selectLayer(state.layers, mode, layerId || undefined)
      const fg = mode === "ansi" ? flagString(flags, "fg", "") : flagString(flags, "fg", "#000000")
      const bgValue = flags.get("bg")
      const bg = typeof bgValue === "string" ? bgValue : null
      if (mode === "ansi" && !fg) exitWith("ANSI triangle requires --fg")
      if (mode === "ansi" && bg === null) exitWith("ANSI triangle requires --bg")
      const charFlag = flagString(flags, "char", "")
      const cell = cellFromParts(" ", fg || "#000000", bg)
      drawSubcellTriangle(layer, state.canvas, ax, ay, bx, by, cx, cy, cell, charFlag, fitScore)
    } else if (op === "circle") {
      if (args.length < 5) exitWith(`${command} circle needs cx cy r`)
      const cx = readCoordFloat(args[2], "cx")
      const cy = readCoordFloat(args[3], "cy")
      const r = readCoordFloat(args[4], "r")
      const fill = flagBool(flags, "fill")
      const fg = mode === "ansi" ? flagString(flags, "fg", "") : flagString(flags, "fg", "#000000")
      const bgValue = flags.get("bg")
      const bg = typeof bgValue === "string" ? bgValue : null
      if (mode === "ansi" && !fg) exitWith("ANSI circle requires --fg")
      if (mode === "ansi" && bg === null) exitWith("ANSI circle requires --bg")
      const charFlag = flagString(flags, "char", "")
      const cell = cellFromParts(" ", fg || "#000000", bg)
      drawSubcellCircle(layer, state.canvas, cx, cy, r, aspectY, cell, thickness, fill, charFlag, fitScore)
    } else if (op === "ellipse") {
      if (args.length < 6) exitWith(`${command} ellipse needs cx cy rx ry`)
      const cx = readCoordFloat(args[2], "cx")
      const cy = readCoordFloat(args[3], "cy")
      const rx = readCoordFloat(args[4], "rx")
      const ry = readCoordFloat(args[5], "ry")
      const fill = flagBool(flags, "fill")
      const fg = mode === "ansi" ? flagString(flags, "fg", "") : flagString(flags, "fg", "#000000")
      const bgValue = flags.get("bg")
      const bg = typeof bgValue === "string" ? bgValue : null
      if (mode === "ansi" && !fg) exitWith("ANSI ellipse requires --fg")
      if (mode === "ansi" && bg === null) exitWith("ANSI ellipse requires --bg")
      const charFlag = flagString(flags, "char", "")
      const cell = cellFromParts(" ", fg || "#000000", bg)
      drawSubcellEllipse(layer, state.canvas, cx, cy, rx, ry, aspectY, cell, thickness, fill, charFlag, fitScore)
    } else if (op === "spline") {
      if (args.length < 8 || (args.length - 2) % 2 !== 0) exitWith(`${command} spline needs at least 3 points`)
      const points: { col: number; row: number }[] = []
      for (let i = 2; i < args.length; i += 2) {
        points.push({
          col: readCoordFloat(args[i], `x${(i - 2) / 2 + 1}`),
          row: readCoordFloat(args[i + 1], `y${(i - 2) / 2 + 1}`),
        })
      }
      const fg = mode === "ansi" ? flagString(flags, "fg", "") : flagString(flags, "fg", "#000000")
      const bgValue = flags.get("bg")
      const bg = typeof bgValue === "string" ? bgValue : null
      const charFlag = flagString(flags, "char", "")
      if (mode === "ansi" && !fg) exitWith("ANSI spline requires --fg")
      if (mode === "ansi" && bg === null) exitWith("ANSI spline requires --bg")
      const sampled = catmullRom(points, 14).map((point) => ({
        col: Math.round(point.col),
        row: Math.round(point.row),
      }))
      if (charFlag && charFlag !== "auto") {
        const cell = cellFromParts(charFlag, fg || "#000000", bg)
        for (const [key, stamp] of rasterPolyline(sampled, thickness, cell, state.canvas.cols, state.canvas.rows)) {
          const [col, row] = key.split(",").map(Number)
          setCell(layer, col, row, stamp)
        }
      } else {
        for (let i = 1; i < sampled.length; i++) {
          const a = sampled[i - 1]
          const b = sampled[i]
          const angle = lineAngle(a.col, a.row, b.col, b.row)
          const glyph = pickLineGlyph(angle, thickness)
          const stroke = cellFromParts(glyph, fg || "#000000", bg)
          drawLine(layer, state.canvas, a.col, a.row, b.col, b.row, thickness, stroke)
        }
      }
    } else {
      exitWith(`Unknown ${command} operation: ${op}`)
    }

    if (shouldPrint(flags)) {
      process.stdout.write(serialize(state))
    } else {
      await writeState(filePath, state)
    }
    return
  }

  printUsage()
}

async function main(): Promise<void> {
  await execute(process.argv.slice(2), { baseDir: process.cwd() })
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  exitWith(message)
})
