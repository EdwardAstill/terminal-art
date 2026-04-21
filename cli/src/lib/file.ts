import type { CanvasSize, ImageAsset, Layer } from "./types.js"

export interface FileState {
  canvas: CanvasSize
  layers: Layer[]
  images: ImageAsset[]
}

interface TermArtFileV1 {
  version: 1
  canvas: CanvasSize
  layers: Layer[]
  images: ImageAsset[]
}

export function serialize(state: FileState): string {
  const file: TermArtFileV1 = {
    version: 1,
    canvas: state.canvas,
    layers: state.layers,
    images: state.images,
  }
  return JSON.stringify(file, null, 2)
}

export function deserialize(json: string): FileState {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error("Invalid .termart file: could not parse JSON")
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as Record<string, unknown>)["version"] !== 1
  ) {
    throw new Error("Invalid .termart file: unsupported version or bad format")
  }

  const file = parsed as TermArtFileV1
  if (
    typeof file.canvas !== "object" ||
    file.canvas === null ||
    typeof file.canvas.cols !== "number" ||
    typeof file.canvas.rows !== "number"
  ) {
    throw new Error("Invalid .termart file: bad canvas field")
  }
  if (!Array.isArray(file.layers)) {
    throw new Error("Invalid .termart file: layers must be an array")
  }
  if (!Array.isArray(file.images)) {
    throw new Error("Invalid .termart file: images must be an array")
  }

  return {
    canvas: file.canvas,
    layers: file.layers,
    images: file.images,
  }
}

export function defaultLayers(): Layer[] {
  return [
    { id: "ansi-1", name: "layer 1", kind: "ansi", visible: true, locked: false, cells: {} },
    { id: "ansi-2", name: "layer 2", kind: "ansi", visible: true, locked: false, cells: {} },
    { id: "ascii-1", name: "layer 1", kind: "ascii", visible: true, locked: false, cells: {} },
    { id: "ascii-2", name: "layer 2", kind: "ascii", visible: true, locked: false, cells: {} },
  ]
}

export function createBlankState(canvas: CanvasSize): FileState {
  return {
    canvas,
    layers: defaultLayers(),
    images: [],
  }
}
