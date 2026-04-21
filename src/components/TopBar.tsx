import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MoreHorizontal } from "lucide-react"
import { useAppStore } from "@/lib/store"
import { saveFile, loadFile } from "@/lib/file-format"
import { copyAnsiToClipboard, downloadAnsi } from "@/lib/ansi-export"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

async function handleNew() {
  useAppStore.getState().newCanvas()
}

async function handleSave() {
  const { canvas, layers, images } = useAppStore.getState()
  try {
    await saveFile({ canvas, layers, images })
  } catch (err) {
    console.error("Save failed:", err)
  }
}

async function handleLoad() {
  try {
    const result = await loadFile()
    if (result !== null) {
      useAppStore.getState().loadCanvas(result)
    }
  } catch (err) {
    console.error("Open failed:", err)
  }
}

async function handleExport() {
  const { layers, canvas } = useAppStore.getState()
  try {
    await copyAnsiToClipboard(layers, canvas)
    toast.success("ANSI copied to clipboard")
  } catch {
    toast.error("Copy failed")
  }
}

function handleDownload() {
  const { layers, canvas } = useAppStore.getState()
  downloadAnsi(layers, canvas)
}

function handleUndo() { useAppStore.getState().undo() }
function handleRedo() { useAppStore.getState().redo() }

export function TopBar() {
  const workspace = useAppStore((s) => s.workspace)
  const setWorkspace = useAppStore((s) => s.setWorkspace)

  return (
    <header className="flex items-center gap-1 border-b px-2 py-1 h-9 shrink-0">
      <DropdownMenu>
        <DropdownMenuTrigger className="px-3 py-1 text-xs uppercase tracking-wide hover:bg-muted rounded-sm">
          File
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-40">
          <DropdownMenuItem onClick={handleNew}>New</DropdownMenuItem>
          <DropdownMenuItem onClick={handleLoad}>Open…</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSave}>Save</DropdownMenuItem>
          <DropdownMenuItem onClick={handleSave}>Save As…</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleExport}>Copy ANSI to clipboard</DropdownMenuItem>
          <DropdownMenuItem onClick={handleDownload}>Download ANSI (.txt)</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger className="px-3 py-1 text-xs uppercase tracking-wide hover:bg-muted rounded-sm">
          Edit
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-40">
          <DropdownMenuItem onClick={handleUndo}>Undo</DropdownMenuItem>
          <DropdownMenuItem onClick={handleRedo}>Redo</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>Cut</DropdownMenuItem>
          <DropdownMenuItem>Copy</DropdownMenuItem>
          <DropdownMenuItem>Paste</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger className="px-2 py-1 hover:bg-muted rounded-sm">
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem>Preferences</DropdownMenuItem>
          <DropdownMenuItem>About</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="flex-1" />
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant={workspace === "canvas" ? "default" : "outline"}
          size="xs"
          onClick={() => setWorkspace("canvas")}
          className={cn("uppercase tracking-wide")}
        >
          canvas
        </Button>
        <Button
          type="button"
          variant={workspace === "glyph-lab" ? "default" : "outline"}
          size="xs"
          onClick={() => setWorkspace("glyph-lab")}
          className={cn("uppercase tracking-wide")}
        >
          glyph lab
        </Button>
      </div>
      <span className="text-xs text-muted-foreground px-2">terminal-art</span>
    </header>
  )
}
