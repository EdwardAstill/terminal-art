export type Mode = "ansi" | "ascii"

export type LayerKind = "ansi" | "ascii"

export interface Cell {
  char: string
  fg: string
  bg: string | null
}

export interface Layer {
  id: string
  name: string
  kind: LayerKind
  visible: boolean
  locked: boolean
  cells: Record<string, Cell>
}

export interface ImageAsset {
  id: string
  name: string
}

export interface CanvasSize {
  cols: number
  rows: number
}

export interface GridPos {
  col: number
  row: number
}
