import { Delete, X } from "lucide-react";
import { cn } from "@/lib/utils";

type NumpadProps = {
  onDigit: (d: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  className?: string;
  size?: "md" | "lg";
};

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

export function Numpad({ onDigit, onBackspace, onClear, className, size = "md" }: NumpadProps) {
  const keyCls = cn(
    "tap num rounded-2xl glass-soft font-semibold text-foreground hover:bg-surface-strong",
    size === "lg" ? "h-20 text-3xl" : "h-14 text-xl",
  );
  return (
    <div className={cn("grid grid-cols-3 gap-2", className)}>
      {KEYS.map((k) => (
        <button key={k} type="button" className={keyCls} onClick={() => onDigit(k)}>
          {k}
        </button>
      ))}
      <button
        type="button"
        className={cn(keyCls, "text-wait")}
        onClick={onClear}
        aria-label="Limpar"
      >
        <X className="mx-auto size-6" />
      </button>
      <button type="button" className={keyCls} onClick={() => onDigit("0")}>
        0
      </button>
      <button type="button" className={keyCls} onClick={onBackspace} aria-label="Apagar">
        <Delete className="mx-auto size-6" />
      </button>
    </div>
  );
}

/** Entrada monetária em centavos: "1250" => R$ 12,50 */
export function centsToNumber(cents: string) {
  return (parseInt(cents || "0", 10) || 0) / 100;
}

export function pushDigit(current: string, digit: string, maxLen = 9) {
  const next = (current + digit).replace(/^0+/, "");
  return next.slice(0, maxLen);
}

export function popDigit(current: string) {
  return current.slice(0, -1);
}
