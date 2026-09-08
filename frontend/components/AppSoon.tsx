import { AppChrome } from "./AppChrome";

// Placeholder for app tabs not built yet (Trade / Chat / More).
export function AppSoon({ title, blurb }: { title: string; blurb: string }) {
  return (
    <AppChrome>
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-white">{title}</h1>
        <p className="mt-3 max-w-xs text-mute">{blurb}</p>
        <span className="mt-6 rounded-full border border-lime/40 bg-lime/10 px-4 py-1.5 text-sm font-medium text-lime">
          Coming soon
        </span>
      </div>
    </AppChrome>
  );
}
