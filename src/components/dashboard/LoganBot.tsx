import { Bot } from "lucide-react";

export function LoganBot() {
  return (
    <button className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-gradient-to-br from-logan-graphite to-logan-slate shadow-lg shadow-logan-cyan/20 flex items-center justify-center border border-logan-slate/30 hover:shadow-logan-cyan/40 transition-all hover:scale-105 z-50">
      <Bot className="w-7 h-7 text-logan-cyan" />
    </button>
  );
}
