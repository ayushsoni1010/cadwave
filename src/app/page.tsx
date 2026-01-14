import { ViewerShell } from "@/components/viewer/viewer-shell";
import { Toaster } from "@/components/ui/sonner";

export default function Home() {
  return (
    <main className="h-screen w-screen overflow-hidden">
      <ViewerShell />
      <Toaster
        position="bottom-right"
        toastOptions={{
          classNames: {
            toast: "bg-zinc-900 border-zinc-800 text-zinc-100",
            title: "text-white",
            description: "text-zinc-400",
            success: "border-emerald-800 bg-emerald-950/50",
            error: "border-red-800 bg-red-950/50",
            info: "border-amber-800 bg-amber-950/50",
          },
        }}
      />
    </main>
  );
}
