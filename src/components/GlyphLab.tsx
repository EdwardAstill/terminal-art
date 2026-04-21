import { useEffect, useMemo, useState } from "react"
import { Check, Copy, Download, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import {
  createEmptyRows,
  exportGlyphBank,
  GLYPH_CHOICES,
  GRID_COLS,
  GRID_ROWS,
  rotateRows,
  rowsToPrettyGrid,
  toggleCell,
  type GlyphExportEntry,
} from "@/lib/glyph-lab"
import { toast } from "sonner"

type BankState = {
  selected: string
  previewRotation: 0 | 90 | 180 | 270
  rowsByGlyph: Record<string, string[]>
}

const STORAGE_KEY = "terminal-art:glyph-lab:v1"

function defaultState(): BankState {
  const rowsByGlyph: Record<string, string[]> = {}
  for (const glyph of GLYPH_CHOICES) {
    rowsByGlyph[glyph.char] = createEmptyRows()
  }
  return {
    selected: GLYPH_CHOICES[0]?.char ?? "",
    previewRotation: 0,
    rowsByGlyph,
  }
}

function loadState(): BankState {
  if (typeof window === "undefined") return defaultState()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultState()
    const parsed = JSON.parse(raw) as Partial<BankState>
    const fallback = defaultState()
    const rowsByGlyph: Record<string, string[]> = { ...fallback.rowsByGlyph }
    if (parsed.rowsByGlyph && typeof parsed.rowsByGlyph === "object") {
      for (const glyph of GLYPH_CHOICES) {
        const rows = parsed.rowsByGlyph[glyph.char]
        if (Array.isArray(rows) && rows.length === GRID_ROWS) {
          rowsByGlyph[glyph.char] = rows.map((row) => String(row).padEnd(GRID_COLS, "0").slice(0, GRID_COLS))
        }
      }
    }
    const selected = typeof parsed.selected === "string" && rowsByGlyph[parsed.selected]
      ? parsed.selected
      : fallback.selected
    const previewRotation = parsed.previewRotation === 90 || parsed.previewRotation === 180 || parsed.previewRotation === 270
      ? parsed.previewRotation
      : 0
    return { selected, previewRotation, rowsByGlyph }
  } catch {
    return defaultState()
  }
}

function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function GlyphSwatch({
  glyph,
  family,
  active,
  onClick,
}: {
  glyph: string
  family: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-md border px-2 py-1 text-left transition-colors",
        active ? "border-foreground bg-accent text-accent-foreground" : "border-border hover:bg-muted",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm leading-none">{glyph}</span>
        <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{family}</span>
      </div>
    </button>
  )
}

function MiniGrid({
  rows,
  label,
}: {
  rows: string[]
  label: string
}) {
  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
      <div
        className="grid gap-0.5"
        style={{ gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))` }}
      >
        {rows.map((row, r) =>
          Array.from(row).map((cell, c) => (
            <div
              key={`${r}-${c}`}
              className={cn(
                "aspect-[1/2] rounded-[3px] border",
                cell === "1" ? "bg-foreground border-foreground" : "bg-muted border-border",
              )}
            />
          )),
        )}
      </div>
    </div>
  )
}

export function GlyphLab(): React.ReactElement {
  const [state, setState] = useState<BankState>(() => loadState())
  const selectedRows = state.rowsByGlyph[state.selected] ?? createEmptyRows()
  const rotatedRows = useMemo(
    () => rotateRows(selectedRows, state.previewRotation / 90),
    [selectedRows, state.previewRotation],
  )

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  const exportRows = useMemo<GlyphExportEntry[]>(
    () => GLYPH_CHOICES.map((glyph) => ({
      char: glyph.char,
      codepoint: glyph.codepoint,
      rows: state.rowsByGlyph[glyph.char] ?? createEmptyRows(),
    })),
    [state.rowsByGlyph],
  )

  function updateSelectedRows(nextRows: string[]): void {
    setState((prev) => ({
      ...prev,
      rowsByGlyph: {
        ...prev.rowsByGlyph,
        [prev.selected]: nextRows,
      },
    }))
  }

  function toggleSelectedCell(row: number, col: number): void {
    updateSelectedRows(toggleCell(selectedRows, row, col))
  }

  function bakeRotation(): void {
    if (state.previewRotation === 0) return
    updateSelectedRows(rotatedRows)
    setState((prev) => ({ ...prev, previewRotation: 0 }))
  }

  function clearSelected(): void {
    updateSelectedRows(createEmptyRows())
  }

  async function copyExport(): Promise<void> {
    const json = exportGlyphBank(exportRows)
    await navigator.clipboard.writeText(json)
    toast.success("Glyph bank copied")
  }

  function downloadExport(): void {
    downloadText("glyph-bank.json", exportGlyphBank(exportRows))
    toast.success("Glyph bank downloaded")
  }

  return (
    <div className="h-full min-h-0 bg-background">
      <div className="h-full min-h-0 grid grid-cols-[18rem_minmax(0,1fr)_18rem] gap-0">
        <aside className="border-r bg-card min-h-0 flex flex-col">
          <div className="px-3 py-2 border-b">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Glyph Seeds</div>
            <div className="text-xs text-muted-foreground mt-1">Edit the minimal base glyphs. Rotations are exported for you.</div>
          </div>
          <div className="p-2">
            <Input
              value={state.selected}
              onChange={(e) => {
                const next = e.target.value
                if (state.rowsByGlyph[next]) {
                  setState((prev) => ({ ...prev, selected: next }))
                }
              }}
              placeholder="selected glyph"
              className="font-mono text-sm h-8"
            />
          </div>
          <ScrollArea className="flex-1 px-2 pb-2">
            <div className="space-y-1">
              {GLYPH_CHOICES.map((glyph) => (
                <GlyphSwatch
                  key={glyph.char}
                  glyph={glyph.char}
                  family={glyph.family}
                  active={glyph.char === state.selected}
                  onClick={() => setState((prev) => ({ ...prev, selected: glyph.char }))}
                />
              ))}
            </div>
          </ScrollArea>
        </aside>

        <main className="min-h-0 p-4 flex flex-col gap-4 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.04),transparent_45%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Editor</div>
              <div className="font-mono text-2xl leading-none">{state.selected}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {GLYPH_CHOICES.find((glyph) => glyph.char === state.selected)?.family ?? "seed"}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="xs" onClick={() => setState((prev) => ({ ...prev, previewRotation: 0 }))}>
                0°
              </Button>
              <Button variant="outline" size="xs" onClick={() => setState((prev) => ({ ...prev, previewRotation: 90 }))}>
                90°
              </Button>
              <Button variant="outline" size="xs" onClick={() => setState((prev) => ({ ...prev, previewRotation: 180 }))}>
                180°
              </Button>
              <Button variant="outline" size="xs" onClick={() => setState((prev) => ({ ...prev, previewRotation: 270 }))}>
                270°
              </Button>
              <Button variant="secondary" size="xs" onClick={bakeRotation}>
                bake rotation
              </Button>
              <Button variant="ghost" size="xs" onClick={clearSelected}>
                <Trash2 className="size-3" />
                clear
              </Button>
            </div>
          </div>

          <div className="flex-1 min-h-0 grid grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)] gap-4">
            <section className="rounded-lg border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">4x8 Grid</div>
                <div className="font-mono text-xs text-muted-foreground">{rowsToPrettyGrid(selectedRows).replace(/\n/g, " / ")}</div>
              </div>
              <div
                className="grid gap-1"
                style={{ gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))` }}
              >
                {selectedRows.map((row, r) =>
                  Array.from(row).map((cell, c) => (
                    <button
                      key={`${r}-${c}`}
                      type="button"
                      onClick={() => toggleSelectedCell(r, c)}
                      className={cn(
                        "aspect-[1/2] rounded-[4px] border transition-all duration-150",
                        cell === "1"
                          ? "bg-foreground border-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.25)_inset]"
                          : "bg-muted border-border hover:bg-accent",
                      )}
                      aria-label={`toggle cell ${c},${r}`}
                    />
                  )),
                )}
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Check className="size-3.5" />
                click cells to mark coverage bits
              </div>
            </section>

            <section className="rounded-lg border bg-card p-4 shadow-sm min-h-0 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Rotation Preview</div>
                <div className="text-xs text-muted-foreground">{state.previewRotation}°</div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <MiniGrid rows={selectedRows} label="base" />
                <MiniGrid rows={rotatedRows} label="preview" />
              </div>
              <Separator />
              <div className="grid grid-cols-3 gap-3">
                <MiniGrid rows={rotateRows(selectedRows, 1)} label="90°" />
                <MiniGrid rows={rotateRows(selectedRows, 2)} label="180°" />
                <MiniGrid rows={rotateRows(selectedRows, 3)} label="270°" />
              </div>
            </section>
          </div>
        </main>

        <aside className="border-l bg-card min-h-0 flex flex-col p-3 gap-3">
          <div className="rounded-lg border bg-background p-3">
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Export</div>
            <div className="mt-2 space-y-2">
              <Button size="sm" className="w-full justify-start" onClick={copyExport}>
                <Copy className="size-3.5" />
                copy JSON
              </Button>
              <Button size="sm" variant="outline" className="w-full justify-start" onClick={downloadExport}>
                <Download className="size-3.5" />
                download JSON
              </Button>
            </div>
          </div>

          <div className="rounded-lg border bg-background p-3 flex-1 min-h-0">
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Current Glyphs</div>
            <ScrollArea className="mt-2 h-[calc(100%-1.25rem)] pr-2">
              <div className="space-y-2">
                {exportRows.slice(0, 8).map((entry) => (
                  <div key={entry.char} className="rounded-md border p-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-base">{entry.char}</span>
                      <span className="text-[10px] text-muted-foreground">{entry.codepoint}</span>
                    </div>
                    <pre className="mt-2 font-mono text-[10px] leading-none text-muted-foreground overflow-hidden">{entry.rows.join("\n")}</pre>
                    <div className="mt-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      exports 4 rotations
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </aside>
      </div>
    </div>
  )
}
