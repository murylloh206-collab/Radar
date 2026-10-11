import { STATUS_LABEL } from "@/lib/offer-rules";
import type { OfferStatus } from "@/lib/types";

/** Cores de cada status — usadas em todo o painel. */
export const STATUS_STYLES: Record<
  OfferStatus,
  { badge: string; dot: string; ring: string; bar: string; text: string }
> = {
  pendente: {
    badge: "bg-amber-400/15 text-amber-300 ring-amber-400/30",
    dot: "bg-amber-400",
    ring: "hover:ring-amber-400/30",
    bar: "from-amber-400 to-orange-500",
    text: "text-amber-300",
  },
  aprovado: {
    badge: "bg-emerald-400/15 text-emerald-300 ring-emerald-400/30",
    dot: "bg-emerald-400",
    ring: "ring-emerald-400/25 hover:ring-emerald-400/50",
    bar: "from-emerald-400 to-teal-500",
    text: "text-emerald-300",
  },
  rejeitado: {
    badge: "bg-rose-400/10 text-rose-300/90 ring-rose-400/25",
    dot: "bg-rose-400/80",
    ring: "hover:ring-rose-400/25",
    bar: "from-rose-500/70 to-rose-400/50",
    text: "text-rose-300/90",
  },
};

export function StatusBadge({ status }: { status: OfferStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 backdrop-blur ${s.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}
