import type { CanvasSize, Layer, ImageAsset } from "./types"

export interface FileState {
  canvas: CanvasSize
  layers: Layer[]
  images: ImageAsset[]
}

interface TerMartFileV1 {
  version: 1
  canvas: CanvasSize
  layers: Layer[]
  images: ImageAsset[]
}

export function serialize(state: FileState): string {
  const file: TerMartFileV1 = {
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

  const file = parsed as TerMartFileV1

  if (
    typeof file.canvas !== "object" ||
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

export async function saveFile(state: FileState): Promise<void> {
  const json = serialize(state)

  if (typeof window !== "undefined" && "showSaveFilePicker" in window) {
    try {
      const handle = await (
        window as typeof window & {
          showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle>
        }
      ).showSaveFilePicker({
        suggestedName: "untitled.termart",
        types: [
          {
            description: "Terminal Art File",
            accept: { "application/json": [".termart"] },
          },
        ],
      })
      const writable = await handle.createWritable()
      await writable.write(json)
      await writable.close()
      return
    } catch (err) {
      // User cancelled — that's fine
      if (err instanceof DOMException && err.name === "AbortError") return
      throw err
    }
  }

  // Fallback: trigger download
  const blob = new Blob([json], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "untitled.termart"
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function loadFile(): Promise<FileState | null> {
  if (typeof window !== "undefined" && "showOpenFilePicker" in window) {
    try {
      const [handle] = await (
        window as typeof window & {
          showOpenFilePicker: (opts: unknown) => Promise<FileSystemFileHandle[]>
        }
      ).showOpenFilePicker({
        types: [
          {
            description: "Terminal Art File",
            accept: { "application/json": [".termart"] },
          },
        ],
        multiple: false,
      })
      const file = await handle.getFile()
      const text = await file.text()
      return deserialize(text)
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return null
      throw err
    }
  }

  // Fallback: hidden file input
  return new Promise((resolve, reject) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".termart,application/json"
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) {
        resolve(null)
        return
      }
      try {
        const text = await file.text()
        resolve(deserialize(text))
      } catch (err) {
        reject(err)
      }
    }
    input.oncancel = () => resolve(null)
    document.body.appendChild(input)
    input.click()
    document.body.removeChild(input)
  })
}
