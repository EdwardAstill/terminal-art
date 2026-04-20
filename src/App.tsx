import { TopBar } from "@/components/TopBar"
import { LeftPanel } from "@/components/LeftPanel"
import { RightPanel } from "@/components/RightPanel"
import { Canvas } from "@/components/Canvas"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"

function App() {
  return (
    <TooltipProvider>
      <div className="h-screen w-screen flex flex-col overflow-hidden">
        <TopBar />
        <div className="flex-1 min-h-0 flex">
          <LeftPanel />
          <Canvas />
          <RightPanel />
        </div>
      </div>
      <Toaster />
    </TooltipProvider>
  )
}

export default App
