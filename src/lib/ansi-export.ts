import type { Layer, CanvasSize } from "./types"
import { compositeLayers, cellKey } from "./canvas-utils"

function hexToRgb(hex: string): [number, number, number] {
  const cleaned = hex.replace(/^#/, "")
  const int = parseInt(cleaned, 16)
  const r = (int >> 16) & 0xff
  const g = (int >> 8) & 0xff
  const b = int & 0xff
  return [r, g, b]
}

/**
 * Render composited visible layers to a raw ANSI escape code string.
 * Each cell emits: ESC[38;2;R;G;Bm (fg) + ESC[48;2;R;G;Bm (bg) + char
 * End of each row: ESC[0m + newline
 * Empty cells are rendered as spaces with no colour.
 */
export function exportToAnsi(layers: Layer[], canvas: CanvasSize): string {
  const composited = compositeLayers(layers, canvas.cols, canvas.rows)
  let output = ""

  for (let r = 0; r < canvas.rows; r++) {
    for (let c = 0; c < canvas.cols; c++) {
      const key = cellKey(c, r)
      const cell = composited.get(key)

      if (cell) {
        const char = cell.char && cell.char !== " " ? cell.char : null
        if (char && cell.fg && cell.fg !== cell.bg) {
          const [fr, fg, fb] = hexToRgb(cell.fg)
          output += `\x1b[38;2;${fr};${fg};${fb}m`
        }
        if (cell.bg) {
          const [br, bg, bb] = hexToRgb(cell.bg)
          output += `\x1b[48;2;${br};${bg};${bb}m`
        }
        output += char ?? " "
      } else {
        output += "\x1b[0m "
      }
    }
    output += "\x1b[0m\n"
  }

  return output
}

/**
 * Copy the exported ANSI string to the clipboard.
 * Falls back to prompt() if clipboard API unavailable.
 */
export async function copyAnsiToClipboard(layers: Layer[], canvas: CanvasSize): Promise<void> {
  const ansi = exportToAnsi(layers, canvas)

  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    await navigator.clipboard.writeText(ansi)
    console.log("ANSI export copied to clipboard.")
  } else {
    prompt("Copy the ANSI output below:", ansi)
  }
}

/**
 * Trigger a browser download of the ANSI string as a .txt file.
 */
export function downloadAnsi(layers: Layer[], canvas: CanvasSize, filename = "terminal-art.txt"): void {
  const ansi = exportToAnsi(layers, canvas)
  const blob = new Blob([ansi], { type: "text/plain" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
