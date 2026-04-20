import { useAppStore } from "@/lib/store"
import type { Layer, LayerKind } from "@/lib/types"
import { Eye, EyeOff, Plus, Trash2 } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useState, useRef, useEffect, type KeyboardEvent } from "react"

function LayerRow({
  layer,
  groupSize,
}: {
  layer: Layer
  groupSize: number
}) {
  const activeLayerId = useAppStore((s) => s.activeLayerId)
  const setActiveLayer = useAppStore((s) => s.setActiveLayer)
  const toggleVisibility = useAppStore((s) => s.toggleLayerVisibility)
  const removeLayer = useAppStore((s) => s.removeLayer)
  const renameLayer = useAppStore((s) => s.renameLayer)

  const isActive = activeLayerId === layer.id
  const [isHovered, setIsHovered] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [draftName, setDraftName] = useState(layer.name)
  const inputRef = useRef<HTMLInputElement>(null)

  // keep draft in sync if layer name changes externally
  useEffect(() => {
    if (!isEditing) setDraftName(layer.name)
  }, [layer.name, isEditing])

  // focus input when editing starts
  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [isEditing])

  function commitRename() {
    const trimmed = draftName.trim()
    if (trimmed && trimmed !== layer.name) {
      renameLayer(layer.id, trimmed)
    } else {
      setDraftName(layer.name)
    }
    setIsEditing(false)
  }

  function cancelRename() {
    setDraftName(layer.name)
    setIsEditing(false)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault()
      commitRename()
    } else if (e.key === "Escape") {
      e.preventDefault()
      cancelRename()
    }
  }

  const canDelete = groupSize > 1

  return (
    <div
      role="button"
      onClick={() => !isEditing && setActiveLayer(layer.id)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "group flex items-center gap-2 px-2 py-1 rounded-sm text-xs cursor-pointer",
        isActive
          ? "bg-accent text-accent-foreground"
          : "hover:bg-muted",
      )}
    >
      {/* Eye toggle */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          toggleVisibility(layer.id)
        }}
        className="flex items-center justify-center size-4 shrink-0 text-muted-foreground hover:text-foreground"
        aria-label={layer.visible ? "hide layer" : "show layer"}
      >
        {layer.visible ? (
          <Eye className="size-3.5" />
        ) : (
          <EyeOff className="size-3.5" />
        )}
      </button>

      {/* Layer name — static or inline edit */}
      {isEditing ? (
        <Input
          ref={inputRef}
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={commitRename}
          onKeyDown={handleKeyDown}
          onClick={(e) => e.stopPropagation()}
          className="h-5 flex-1 min-w-0 px-1 py-0 text-xs rounded-sm"
        />
      ) : (
        <span
          onDoubleClick={(e) => {
            e.stopPropagation()
            setIsEditing(true)
          }}
          className={cn(
            "flex-1 truncate select-none",
            !layer.visible && "line-through text-muted-foreground",
          )}
        >
          {layer.name}
        </span>
      )}

      {/* Delete button — visible on hover, hidden when only layer in group */}
      {canDelete && isHovered && !isEditing && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            removeLayer(layer.id)
          }}
          className="flex items-center justify-center size-4 shrink-0 text-muted-foreground hover:text-destructive"
          aria-label="delete layer"
        >
          <Trash2 className="size-3" />
        </button>
      )}
    </div>
  )
}

function LayerGroup({
  title,
  kind,
  layers,
}: {
  title: string
  kind: LayerKind
  layers: Layer[]
}) {
  const addLayer = useAppStore((s) => s.addLayer)

  const group = layers.filter((l) => l.kind === kind)

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between px-2 pt-3 pb-1">
        <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
          {title}
        </span>
        <button
          onClick={() => addLayer(kind)}
          className="text-muted-foreground hover:text-foreground"
          aria-label={`add ${title} layer`}
        >
          <Plus className="size-3" />
        </button>
      </div>
      {group.map((l) => (
        <LayerRow key={l.id} layer={l} groupSize={group.length} />
      ))}
    </div>
  )
}

export function RightPanel() {
  const layers = useAppStore((s) => s.layers)
  return (
    <aside className="w-56 shrink-0 border-l bg-card flex flex-col">
      <ScrollArea className="flex-1">
        <div className="p-1">
          <LayerGroup title="ASCII" kind="ascii" layers={layers} />
          <LayerGroup title="ANSI" kind="ansi" layers={layers} />
        </div>
      </ScrollArea>
    </aside>
  )
}
