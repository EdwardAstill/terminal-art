import { create } from "zustand"
import type {
  CanvasSize,
  Cell,
  CellSettings,
  GridPos,
  ImageAsset,
  Layer,
  LayerKind,
  Mode,
  Tool,
} from "./types"

type LayerCellsSnapshot = Record<string, Record<string, Cell>>

const MAX_HISTORY = 50

function snapshotLayers(layers: Layer[]): LayerCellsSnapshot {
  const snap: LayerCellsSnapshot = {}
  for (const l of layers) snap[l.id] = { ...l.cells }
  return snap
}

function restoreLayers(layers: Layer[], snap: LayerCellsSnapshot): Layer[] {
  return layers.map((l) =>
    l.id in snap ? { ...l, cells: snap[l.id] } : l,
  )
}

function nextLayerName(layers: Layer[], kind: LayerKind): string {
  const count = layers.filter((l) => l.kind === kind).length
  return `layer ${count + 1}`
}

function bestLayerForMode(layers: Layer[], mode: Mode): string | null {
  const kind: LayerKind = mode === "ascii" ? "ascii" : "ansi"
  return layers.find((l) => l.kind === kind && l.visible)?.id
    ?? layers.find((l) => l.kind === kind)?.id
    ?? null
}

const L = (id: string, name: string, kind: LayerKind, visible: boolean): Layer => ({
  id, name, kind, visible, locked: false, cells: {},
})

export interface AppState {
  mode: Mode
  tool: Tool
  imageMode: boolean
  thickness: number
  cell: CellSettings
  canvas: CanvasSize
  layers: Layer[]
  activeLayerId: string | null
  images: ImageAsset[]
  hoverCell: GridPos | null
  undoStack: LayerCellsSnapshot[]
  redoStack: LayerCellsSnapshot[]

  setMode: (mode: Mode) => void
  setTool: (tool: Tool) => void
  toggleImageMode: () => void
  setThickness: (thickness: number) => void
  updateCell: (patch: Partial<CellSettings>) => void
  toggleLayerVisibility: (id: string) => void
  toggleLayerLock: (id: string) => void
  setActiveLayer: (id: string) => void
  setHoverCell: (pos: GridPos | null) => void
  paintCells: (layerId: string, entries: [string, Cell][]) => void
  eraseCell: (layerId: string, col: number, row: number, radius: number) => void
  beginStroke: () => void

  addLayer: (kind: LayerKind) => void
  removeLayer: (id: string) => void
  renameLayer: (id: string, name: string) => void
  clearLayer: (id: string) => void
  reorderLayer: (id: string, direction: "up" | "down") => void

  undo: () => void
  redo: () => void

  newCanvas: () => void
  loadCanvas: (data: Pick<AppState, "canvas" | "layers" | "images">) => void
}

const defaultLayers: Layer[] = [
  L("ansi-1", "layer 1", "ansi", true),
  L("ansi-2", "layer 2", "ansi", true),
  L("ascii-1", "layer 1", "ascii", true),
  L("ascii-2", "layer 2", "ascii", true),
]

const defaultCell: CellSettings = {
  mainColor: "#e5484d",
  textureColor: "#1f2937",
  fillMode: "symbol",
  texture: "dots",
  symbol: "█",
}

export const useAppStore = create<AppState>()((set, get) => ({
  mode: "ansi",
  tool: "brush",
  imageMode: false,
  thickness: 1,
  cell: defaultCell,
  canvas: { cols: 80, rows: 24 },
  layers: defaultLayers,
  activeLayerId: "ansi-1",
  images: [
    { id: "img-1", name: "image1.svg" },
    { id: "img-2", name: "image2.png" },
  ],
  hoverCell: null,
  undoStack: [],
  redoStack: [],

  setMode: (mode) =>
    set((s) => ({
      mode,
      activeLayerId: bestLayerForMode(s.layers, mode) ?? s.activeLayerId,
    })),

  setTool: (tool) => set({ tool }),
  toggleImageMode: () => set((s) => ({ imageMode: !s.imageMode })),
  setThickness: (thickness) => set({ thickness }),
  updateCell: (patch) => set((s) => ({ cell: { ...s.cell, ...patch } })),

  toggleLayerVisibility: (id) =>
    set((s) => ({
      layers: s.layers.map((l) => l.id === id ? { ...l, visible: !l.visible } : l),
    })),

  toggleLayerLock: (id) =>
    set((s) => ({
      layers: s.layers.map((l) => l.id === id ? { ...l, locked: !l.locked } : l),
    })),

  setActiveLayer: (id) => set({ activeLayerId: id }),
  setHoverCell: (pos) => set({ hoverCell: pos }),

  beginStroke: () =>
    set((s) => ({
      undoStack: [...s.undoStack.slice(-MAX_HISTORY + 1), snapshotLayers(s.layers)],
      redoStack: [],
    })),

  paintCells: (layerId, entries) =>
    set((s) => ({
      layers: s.layers.map((l) => {
        if (l.id !== layerId || l.locked) return l
        const cells = { ...l.cells }
        for (const [key, cell] of entries) cells[key] = cell
        return { ...l, cells }
      }),
    })),

  eraseCell: (layerId, col, row, radius) =>
    set((s) => ({
      layers: s.layers.map((l) => {
        if (l.id !== layerId || l.locked) return l
        const cells = { ...l.cells }
        const half = Math.floor(radius / 2)
        for (let dr = -half; dr <= half; dr++) {
          for (let dc = -half; dc <= half; dc++) {
            delete cells[`${col + dc},${row + dr}`]
          }
        }
        return { ...l, cells }
      }),
    })),

  addLayer: (kind) => {
    const s = get()
    const id = `${kind}-${Date.now()}`
    const name = nextLayerName(s.layers, kind)
    const newLayer: Layer = { id, name, kind, visible: true, locked: false, cells: {} }
    set((s) => ({
      layers: [...s.layers, newLayer],
      activeLayerId: id,
      undoStack: [...s.undoStack.slice(-MAX_HISTORY + 1), snapshotLayers(s.layers)],
      redoStack: [],
    }))
  },

  removeLayer: (id) =>
    set((s) => {
      const remaining = s.layers.filter((l) => l.id !== id)
      const removed = s.layers.find((l) => l.id === id)
      if (!removed) return {}
      const sameKind = remaining.filter((l) => l.kind === removed.kind)
      const newActive =
        s.activeLayerId === id
          ? (sameKind[sameKind.length - 1]?.id ?? remaining[remaining.length - 1]?.id ?? null)
          : s.activeLayerId
      return {
        layers: remaining,
        activeLayerId: newActive,
        undoStack: [...s.undoStack.slice(-MAX_HISTORY + 1), snapshotLayers(s.layers)],
        redoStack: [],
      }
    }),

  renameLayer: (id, name) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, name } : l)),
    })),

  clearLayer: (id) =>
    set((s) => ({
      layers: s.layers.map((l) => l.id === id ? { ...l, cells: {} } : l),
      undoStack: [...s.undoStack.slice(-MAX_HISTORY + 1), snapshotLayers(s.layers)],
      redoStack: [],
    })),

  reorderLayer: (id, direction) =>
    set((s) => {
      const layer = s.layers.find((l) => l.id === id)
      if (!layer) return {}
      const group = s.layers.filter((l) => l.kind === layer.kind)
      const others = s.layers.filter((l) => l.kind !== layer.kind)
      const idx = group.findIndex((l) => l.id === id)
      const newIdx = direction === "up" ? idx + 1 : idx - 1
      if (newIdx < 0 || newIdx >= group.length) return {}
      const newGroup = [...group]
      ;[newGroup[idx], newGroup[newIdx]] = [newGroup[newIdx], newGroup[idx]]
      // Rebuild layers preserving interleave order (ansi first, then ascii)
      const ansi = (layer.kind === "ansi" ? newGroup : others).filter((l) => l.kind === "ansi")
      const ascii = (layer.kind === "ascii" ? newGroup : others).filter((l) => l.kind === "ascii")
      return { layers: [...ansi, ...ascii] }
    }),

  undo: () =>
    set((s) => {
      if (s.undoStack.length === 0) return {}
      const prev = s.undoStack[s.undoStack.length - 1]
      return {
        layers: restoreLayers(s.layers, prev),
        undoStack: s.undoStack.slice(0, -1),
        redoStack: [...s.redoStack, snapshotLayers(s.layers)],
      }
    }),

  redo: () =>
    set((s) => {
      if (s.redoStack.length === 0) return {}
      const next = s.redoStack[s.redoStack.length - 1]
      return {
        layers: restoreLayers(s.layers, next),
        redoStack: s.redoStack.slice(0, -1),
        undoStack: [...s.undoStack, snapshotLayers(s.layers)],
      }
    }),

  newCanvas: () =>
    set({
      layers: defaultLayers.map((l) => ({ ...l, cells: {} })),
      activeLayerId: "ansi-1",
      undoStack: [],
      redoStack: [],
    }),

  loadCanvas: (data) =>
    set({
      canvas: data.canvas,
      layers: data.layers,
      images: data.images,
      activeLayerId: data.layers.find((l) => l.kind === "ansi")?.id ?? data.layers[0]?.id ?? null,
      undoStack: [],
      redoStack: [],
    }),
}))
