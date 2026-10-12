import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Offer, SchedulerSettings } from "../types";

/**
 * CLIENTE OFICIAL DO SUPABASE (POSTGRESQL)
 * -----------------------------------------
 * Armazenamento persistente e compartilhado para produção na Vercel.
 * Regra estrita: em produção, NUNCA há fallback silencioso para JSON.
 */

let cachedClient: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_URL &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)
  );
}

export function getSupabaseClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    if (process.env.VERCEL || process.env.NODE_ENV === "production") {
      throw new Error(
        "Configuração obrigatória ausente: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY não estão definidos. " +
          "Em produção na Vercel, o armazenamento no Supabase é obrigatório para garantir a sincronização entre os administradores e prevenir perda de dados."
      );
    }
    throw new Error("Supabase não configurado no ambiente local.");
  }

  if (!cachedClient) {
    cachedClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return cachedClient;
}

// ---------------------------------------------------------------------------
// Conversores entre snake_case (Postgres) e camelCase (TypeScript)
// ---------------------------------------------------------------------------

export function mapDbToOffer(row: Record<string, unknown>): Offer {
  return {
    id: String(row.id),
    source: "mercadolivre",
    externalId: String(row.external_id || ""),
    title: String(row.title || ""),
    thumbnail: (row.thumbnail as string) || null,
    price: Number(row.price || 0),
    originalPrice: row.original_price != null ? Number(row.original_price) : null,
    discountPercent: row.discount_percent != null ? Number(row.discount_percent) : null,
    currency: String(row.currency || "BRL"),
    originalUrl: String(row.original_url || ""),
    freeShipping: Boolean(row.free_shipping),
    searchTerm: String(row.search_term || ""),
    status: (row.status as Offer["status"]) || "pendente",
    affiliateUrl: (row.affiliate_url as string) || null,
    shortUrl: (row.short_url as string) || null,
    shortUrlStatus: (row.short_url_status as Offer["shortUrlStatus"]) || "pendente",
    shortUrlGeneratedAt: (row.short_url_generated_at as string) || null,
    shortUrlAttempts: Number(row.short_url_attempts || 0),
    shortUrlError: (row.short_url_error as string) || null,
    coupon: (row.coupon as string) || null,
    couponDescription: (row.coupon_description as string) || null,
    rating: row.rating != null ? Number(row.rating) : null,
    reviewsCount: row.reviews_count != null ? Number(row.reviews_count) : null,
    sellerReputation: (row.seller_reputation as string) || null,
    commission: (row.commission as Offer["commission"]) || null,
    opportunityScore: Number(row.opportunity_score || 0),
    opportunityReason: (row.opportunity_reason as string) || "",
    priceHistory: (row.price_history as Offer["priceHistory"]) || [],
    whatsappStatus: (row.whatsapp_status as Offer["whatsappStatus"]) || "rascunho",
    whatsappMessage: (row.whatsapp_message as string) || undefined,
    whatsappQueuedAt: (row.whatsapp_queued_at as string) || null,
    whatsappSentAt: (row.whatsapp_sent_at as string) || null,
    whatsappError: (row.whatsapp_error as string) || null,
    scheduledFor: (row.scheduled_for as string) || null,
    scheduledWindowDate: (row.scheduled_window_date as string) || null,
    sendAttempts: Number(row.send_attempts || 0),
    lockedAt: (row.locked_at as string) || null,
    createdAt: (row.created_at as string) || new Date().toISOString(),
    updatedAt: (row.updated_at as string) || new Date().toISOString(),
    lastSeenAt: (row.last_seen_at as string) || new Date().toISOString(),
    statusChangedAt: (row.status_changed_at as string) || null,
  };
}

export function mapOfferToDb(offer: Offer): Record<string, unknown> {
  return {
    id: offer.id,
    source: offer.source,
    external_id: offer.externalId,
    title: offer.title,
    thumbnail: offer.thumbnail,
    price: offer.price,
    original_price: offer.originalPrice,
    discount_percent: offer.discountPercent,
    currency: offer.currency,
    original_url: offer.originalUrl,
    free_shipping: offer.freeShipping,
    search_term: offer.searchTerm,
    status: offer.status,
    affiliate_url: offer.affiliateUrl,
    short_url: offer.shortUrl,
    short_url_status: offer.shortUrlStatus ?? "pendente",
    short_url_generated_at: offer.shortUrlGeneratedAt,
    short_url_attempts: offer.shortUrlAttempts ?? 0,
    short_url_error: offer.shortUrlError,
    coupon: offer.coupon,
    coupon_description: offer.couponDescription,
    rating: offer.rating,
    reviews_count: offer.reviewsCount,
    seller_reputation: offer.sellerReputation,
    commission: offer.commission,
    opportunity_score: offer.opportunityScore ?? 0,
    opportunity_reason: offer.opportunityReason,
    price_history: offer.priceHistory ?? [],
    whatsapp_status: offer.whatsappStatus ?? "rascunho",
    whatsapp_message: offer.whatsappMessage,
    whatsapp_queued_at: offer.whatsappQueuedAt,
    whatsapp_sent_at: offer.whatsappSentAt,
    whatsapp_error: offer.whatsappError,
    scheduled_for: offer.scheduledFor,
    scheduled_window_date: offer.scheduledWindowDate,
    send_attempts: offer.sendAttempts ?? 0,
    locked_at: offer.lockedAt,
    created_at: offer.createdAt,
    updated_at: offer.updatedAt,
    last_seen_at: offer.lastSeenAt,
    status_changed_at: offer.statusChangedAt,
  };
}

export function mapDbToSchedulerSettings(row: Record<string, unknown>): SchedulerSettings {
  return {
    state: (row.state as SchedulerSettings["state"]) || "ativo",
    startHour: String(row.start_hour || "07:00"),
    endHour: String(row.end_hour || "00:00"),
    dailyTarget: Number(row.daily_target || 60),
    maxPerHour: Number(row.max_per_hour || 5),
    timezone: String(row.timezone || "America/Sao_Paulo"),
    channelDestination: String(row.channel_destination || "Grupo VIP de Ofertas"),
    consecutiveFailures: Number(row.consecutive_failures || 0),
    maxConsecutiveFailures: Number(row.max_consecutive_failures || 3),
    lastDispatchedAt: (row.last_dispatched_at as string) || null,
    lastDispatchedOfferTitle: (row.last_dispatched_title as string) || null,
    lastError: (row.last_error as string) || null,
  };
}
