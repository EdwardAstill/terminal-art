import type { Cell } from "./types"

export interface HalfBlockCell {
  char: "▀"
  fg: string // CSS hex color for top pixel e.g. "#ff0000"
  bg: string // CSS hex color for bottom pixel e.g. "#00ff00"
}

function rgbaToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    r.toString(16).padStart(2, "0") +
    g.toString(16).padStart(2, "0") +
    b.toString(16).padStart(2, "0")
  )
}

/**
 * Convert ImageData to a grid of HalfBlockCells.
 * imageData must be cols * (rows * 2) pixels.
 */
export function imageDataToHalfBlocks(
  imageData: ImageData,
  cols: number,
  rows: number,
): HalfBlockCell[][] {
  const grid: HalfBlockCell[][] = []
  const { data } = imageData

  for (let r = 0; r < rows; r++) {
    const row: HalfBlockCell[] = []
    for (let c = 0; c < cols; c++) {
      // Top pixel at (c, r*2)
      const topIndex = (r * 2 * cols + c) * 4
      const topR = data[topIndex]
      const topG = data[topIndex + 1]
      const topB = data[topIndex + 2]

      // Bottom pixel at (c, r*2+1)
      const bottomIndex = ((r * 2 + 1) * cols + c) * 4
      const bottomR = data[bottomIndex]
      const bottomG = data[bottomIndex + 1]
      const bottomB = data[bottomIndex + 2]

      row.push({
        char: "▀",
        fg: rgbaToHex(topR, topG, topB),
        bg: rgbaToHex(bottomR, bottomG, bottomB),
      })
    }
    grid.push(row)
  }

  return grid
}

/**
 * Load an image File into an HTMLImageElement and draw it onto an
 * offscreen canvas scaled to cols × (rows * 2) pixels, then return
 * the resulting HalfBlockCell grid.
 */
export async function fileToHalfBlocks(
  file: File,
  cols: number,
  rows: number,
): Promise<HalfBlockCell[][]> {
  const url = URL.createObjectURL(file)

  try {
    const img = new Image()

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error(`Failed to load image: ${file.name}`))
      img.src = url
    })

    const canvas = document.createElement("canvas")
    canvas.width = cols
    canvas.height = rows * 2

    const ctx = canvas.getContext("2d")
    if (ctx === null) {
      throw new Error("Could not get 2D context from offscreen canvas")
    }

    ctx.drawImage(img, 0, 0, cols, rows * 2)

    const imageData = ctx.getImageData(0, 0, cols, rows * 2)
    return imageDataToHalfBlocks(imageData, cols, rows)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function halfBlockToCell(hb: HalfBlockCell): Cell {
  return { char: hb.char, fg: hb.fg, bg: hb.bg }
}
