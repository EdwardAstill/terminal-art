import { useAppStore } from "@/lib/store"
import type { CellFillMode, Tool } from "@/lib/types"
import { cellSettingsToCell } from "@/lib/canvas-utils"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"
import {
  Brush,
  Minus,
  Square,
  Pentagon,
  Plus,
  Image as ImageIcon,
} from "lucide-react"

const tools: { id: Tool; label: string; icon: React.ReactNode }[] = [
  { id: "brush", label: "brush", icon: <Brush className="size-3.5" /> },
  { id: "line", label: "line", icon: <Minus className="size-3.5" /> },
  { id: "rectangle", label: "rectangle", icon: <Square className="size-3.5" /> },
  { id: "polygon", label: "polygon", icon: <Pentagon className="size-3.5" /> },
]

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground px-3 pt-3 pb-1.5">
      {children}
    </div>
  )
}

function ColorSwatch({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="relative inline-flex items-center">
      <span
        className="size-5 rounded-sm border border-border"
        style={{ backgroundColor: value }}
      />
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 opacity-0 cursor-pointer"
      />
    </label>
  )
}

function CellPreview() {
  const settings = useAppStore((s) => s.cell)
  const painted = cellSettingsToCell(settings)
  const showChar = painted.char && painted.char !== " " ? painted.char : null
  return (
    <div
      className="size-7 border border-border flex items-center justify-center font-mono leading-none overflow-hidden"
      style={{
        backgroundColor: painted.bg ?? settings.mainColor,
        color: painted.fg,
        fontSize: 18,
      }}
    >
      {showChar}
    </div>
  )
}

export function LeftPanel() {
  const mode = useAppStore((s) => s.mode)
  const setMode = useAppStore((s) => s.setMode)
  const tool = useAppStore((s) => s.tool)
  const setTool = useAppStore((s) => s.setTool)
  const cell = useAppStore((s) => s.cell)
  const updateCell = useAppStore((s) => s.updateCell)
  const thickness = useAppStore((s) => s.thickness)
  const setThickness = useAppStore((s) => s.setThickness)
  const images = useAppStore((s) => s.images)
  const imageMode = useAppStore((s) => s.imageMode)
  const toggleImageMode = useAppStore((s) => s.toggleImageMode)

  return (
    <aside className="w-64 shrink-0 border-r bg-card flex flex-col">
      <ScrollArea className="flex-1">
        <div className="p-2 pb-4">
          {/* Mode tabs */}
          <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
            <TabsList className="w-full grid grid-cols-2 h-8">
              <TabsTrigger value="ansi" className="text-xs">
                ansi
              </TabsTrigger>
              <TabsTrigger value="ascii" className="text-xs">
                ascii
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Tools */}
          <SectionTitle>Tools</SectionTitle>
          <ToggleGroup
            type="single"
            value={tool}
            onValueChange={(v) => v && setTool(v as Tool)}
            className="grid grid-cols-2 gap-1.5 px-1"
          >
            {tools.map((t) => (
              <ToggleGroupItem
                key={t.id}
                value={t.id}
                aria-label={t.label}
                className="justify-start gap-2 h-8 border data-[state=on]:bg-accent data-[state=on]:border-foreground/20"
              >
                {t.icon}
                <span className="text-xs">{t.label}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          <Separator className="my-3" />

          {/* CELL */}
          <SectionTitle>Cell</SectionTitle>
          <div className="px-3 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-normal text-muted-foreground">
                main colour
              </Label>
              <ColorSwatch
                value={cell.mainColor}
                onChange={(v) => updateCell({ mainColor: v })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs font-normal text-muted-foreground">
                texture colour
              </Label>
              <ColorSwatch
                value={cell.textureColor}
                onChange={(v) => updateCell({ textureColor: v })}
              />
            </div>
            <div className="pt-1">
              <ToggleGroup
                type="single"
                value={cell.fillMode}
                onValueChange={(v) =>
                  v && updateCell({ fillMode: v as CellFillMode })
                }
                className="grid grid-cols-2 gap-1"
              >
                <ToggleGroupItem
                  value="texture"
                  className="h-7 text-xs border data-[state=on]:bg-accent data-[state=on]:border-foreground/20"
                >
                  texture
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="symbol"
                  className="h-7 text-xs border data-[state=on]:bg-accent data-[state=on]:border-foreground/20"
                >
                  symbol
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            {cell.fillMode === "texture" ? (
              <Input
                value={cell.texture}
                onChange={(e) => updateCell({ texture: e.target.value })}
                className="h-7 text-xs"
                placeholder="pattern name"
              />
            ) : (
              <Input
                value={cell.symbol}
                onChange={(e) => updateCell({ symbol: e.target.value.slice(0, 2) })}
                className="h-7 text-xs font-mono"
                placeholder="█"
              />
            )}
            <div className="flex items-center justify-between pt-1">
              <Label className="text-xs font-normal text-muted-foreground">
                overall
              </Label>
              <CellPreview />
            </div>
          </div>

          <Separator className="my-3" />

          {/* TOOL props */}
          <SectionTitle>Tool</SectionTitle>
          <div className="px-3 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-normal text-muted-foreground">
                thickness
              </Label>
              <span className="font-mono text-xs tabular-nums">
                {thickness}
              </span>
            </div>
            <Slider
              min={1}
              max={10}
              step={1}
              value={[thickness]}
              onValueChange={(v) => setThickness(v[0])}
            />
          </div>

          <Separator className="my-3" />

          {/* Images */}
          <SectionTitle>Images</SectionTitle>
          <ul className="px-3 space-y-1 text-xs">
            {images.map((img) => (
              <li
                key={img.id}
                className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <ImageIcon className="size-3" />
                {img.name}
              </li>
            ))}
            <li className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground cursor-pointer">
              <Plus className="size-3" />
              add
            </li>
          </ul>

          <Separator className="my-3" />

          {/* Image mode button */}
          <div className="px-3">
            <Button
              variant={imageMode ? "default" : "outline"}
              size="sm"
              className="w-full h-9 text-xs"
              onClick={toggleImageMode}
            >
              image mode
            </Button>
          </div>
        </div>
      </ScrollArea>
    </aside>
  )
}
