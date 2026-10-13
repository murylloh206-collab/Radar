/**
 * Funções que a interface (navegador) usa para falar com a nossa API local.
 * Nenhuma delas chama serviços externos diretamente.
 */
import type { ApiError, Offer, OfferUpdate, SearchResponse } from "./types";

async function handle<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T | ApiError;
  if (!res.ok) {
    const message = (data as ApiError).error || `Erro ${res.status}`;
    throw new Error(message);
  }
  return data as T;
}

export async function searchOffers(terms: string[]): Promise<SearchResponse> {
  const res = await fetch("/api/offers/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ terms }),
  });
  return handle<SearchResponse>(res);
}

export async function patchOffer(id: string, update: OfferUpdate): Promise<Offer> {
  const res = await fetch(`/api/offers/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
  });
  return handle<Offer>(res);
}

export async function discoverOffers(categoryIds?: string[]): Promise<SearchResponse> {
  const res = await fetch("/api/offers/discover", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ categoryIds }),
  });
  return handle<SearchResponse>(res);
}

export async function deleteRejectedOffers(ids: string[]): Promise<{ ok: boolean; deletedCount: number; message: string }> {
  const res = await fetch("/api/offers/rejected", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  return handle<{ ok: boolean; deletedCount: number; message: string }>(res);
}
