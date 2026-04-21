import type { CanvasSize, Cell, Layer } from "./types.js"
import { cellKey, compositeLayers } from "./canvas.js"

function hexToRgb(hex: string): [number, number, number] {
  const cleaned = hex.replace(/^#/, "")
  const int = parseInt(cleaned, 16)
  return [(int >> 16) & 0xff, (int >> 8) & 0xff, int & 0xff]
}

export function exportAnsi(layers: Layer[], canvas: CanvasSize): string {
  const composited = compositeLayers(layers, canvas.cols, canvas.rows)
  let output = ""

  for (let row = 0; row < canvas.rows; row++) {
    for (let col = 0; col < canvas.cols; col++) {
      const cell = composited.get(cellKey(col, row))
      if (!cell) {
        output += "\x1b[0m "
        continue
      }

      const char = cell.char && cell.char !== " " ? cell.char : " "
      if (cell.fg && cell.fg !== cell.bg && char !== " ") {
        const [fr, fg, fb] = hexToRgb(cell.fg)
        output += `\x1b[38;2;${fr};${fg};${fb}m`
      }
      if (cell.bg) {
        const [br, bg, bb] = hexToRgb(cell.bg)
        output += `\x1b[48;2;${br};${bg};${bb}m`
      }
      output += char
    }
    output += "\x1b[0m\n"
  }

  return output
}

export function exportAscii(layers: Layer[], canvas: CanvasSize): string {
  const asciiLayers = layers.filter((layer) => layer.visible && layer.kind === "ascii")
  const composited = compositeLayers(asciiLayers, canvas.cols, canvas.rows)
  let output = ""

  for (let row = 0; row < canvas.rows; row++) {
    for (let col = 0; col < canvas.cols; col++) {
      const cell = composited.get(cellKey(col, row))
      output += cell?.char ?? " "
    }
    output += "\n"
  }

  return output
}

export function cellFromParts(char: string, fg: string, bg: string | null): Cell {
  return { char, fg, bg }
}
