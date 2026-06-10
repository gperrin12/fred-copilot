import { Chat } from "@/components/Chat";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-fred-navy text-sm font-bold text-white">
            F
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">FRED Copilot</h1>
            <p className="text-sm text-slate-500">
              Ask questions about Federal Reserve economic data
            </p>
          </div>
        </div>
      </header>

      <Chat />
    </main>
  );
}
