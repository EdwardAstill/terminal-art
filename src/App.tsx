import { TopBar } from "@/components/TopBar"
import { LeftPanel } from "@/components/LeftPanel"
import { RightPanel } from "@/components/RightPanel"
import { Canvas } from "@/components/Canvas"
import { GlyphLab } from "@/components/GlyphLab"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { useAppStore } from "@/lib/store"

function App() {
  const workspace = useAppStore((s) => s.workspace)
  return (
    <TooltipProvider>
      <div className="h-screen w-screen flex flex-col overflow-hidden">
        <TopBar />
        {workspace === "canvas" ? (
          <div className="flex-1 min-h-0 flex">
            <LeftPanel />
            <Canvas />
            <RightPanel />
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-hidden">
            <GlyphLab />
          </div>
        )}
      </div>
      <Toaster />
    </TooltipProvider>
  )
}

export default App
