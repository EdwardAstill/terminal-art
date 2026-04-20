export type Mode = "ansi" | "ascii"

export type Tool = "brush" | "eraser" | "line" | "rectangle" | "polygon"

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

export type CellFillMode = "texture" | "symbol"

export interface CellSettings {
  mainColor: string
  textureColor: string
  fillMode: CellFillMode
  texture: string
  symbol: string
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
