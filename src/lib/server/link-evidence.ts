import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { StoreName } from '../types';
import { isSupabaseConfigured, supabase } from '../supabase';

export type ConfirmationSource =
  | 'shopee_graphql_hmac'
  | 'mercadolivre_extension_session'
  | 'rakuten_deeplink_api'
  | 'manual_review_approved'
  | 'parameter_assembled_unverified';

export interface LinkEvidenceRecord {
  id: string;
  userId: string;
  storeName: StoreName;
  productId?: string;
  productTitle?: string;
  originalUrl: string;
  cleanUrl: string;
  finalAffiliateUrl: string;
  confirmationSource: ConfirmationSource;
  verificationStatus: 'verificado' | 'nao_verificado' | 'rejeitado';
  isAutoDispatchAllowed: boolean;
  generatedAt: string;
  expiresAt?: string;
  manualApprovalUserId?: string;
  manualApprovalUrl?: string; // URL exata que foi aprovada; alterar invalida a aprovação
  manualApprovalAt?: string;
  revokedAt?: string;
}

export interface CreateEvidenceInput {
  userId: string;
  storeName: StoreName;
  productId?: string;
  productTitle?: string;
  originalUrl: string;
  cleanUrl: string;
  finalAffiliateUrl: string;
  confirmationSource: ConfirmationSource;
  verificationStatus: 'verificado' | 'nao_verificado' | 'rejeitado';
  isAutoDispatchAllowed: boolean;
  expiresInHours?: number;
}

function getEvidenceFilePath(): string {
  if (process.env.RADAR_EVIDENCE_PATH && process.env.RADAR_EVIDENCE_PATH.trim().length > 0) {
    return path.resolve(process.env.RADAR_EVIDENCE_PATH.trim());
  }
  return path.join(process.cwd(), '.data', 'link_evidence.json');
}

function readLocalEvidence(): LinkEvidenceRecord[] {
  const filePath = getEvidenceFilePath();
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalEvidence(records: LinkEvidenceRecord[]): void {
  const filePath = getEvidenceFilePath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  // Manter no máximo os 1000 registros mais recentes localmente
  const trimmed = records.slice(-1000);
  fs.writeFileSync(filePath, JSON.stringify(trimmed, null, 2), 'utf-8');
}

/**
 * Registra uma nova evidência para um link gerado.
 * Em produção com Supabase configurado, grava como fonte persistente com tratamento estrito de falhas.
 */
export async function registerLinkEvidence(input: CreateEvidenceInput): Promise<LinkEvidenceRecord> {
  const now = new Date();
  const expiresAt = input.expiresInHours
    ? new Date(now.getTime() + input.expiresInHours * 3600 * 1000).toISOString()
    : undefined;

  const record: LinkEvidenceRecord = {
    id: crypto.randomUUID(),
    userId: input.userId,
    storeName: input.storeName,
    productId: input.productId,
    productTitle: input.productTitle,
    originalUrl: input.originalUrl,
    cleanUrl: input.cleanUrl,
    finalAffiliateUrl: input.finalAffiliateUrl,
    confirmationSource: input.confirmationSource,
    verificationStatus: input.verificationStatus,
    isAutoDispatchAllowed: input.isAutoDispatchAllowed,
    generatedAt: now.toISOString(),
    expiresAt,
  };

  // 1. Salvar no Supabase como fonte primária em produção
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('link_evidence_records').insert({
      id: record.id,
      user_id: record.userId,
      store_name: record.storeName,
      product_id: record.productId,
      product_title: record.productTitle,
      original_url: record.originalUrl,
      clean_url: record.cleanUrl,
      final_affiliate_url: record.finalAffiliateUrl,
      confirmation_source: record.confirmationSource,
      verification_status: record.verificationStatus,
      is_auto_dispatch_allowed: record.isAutoDispatchAllowed,
      generated_at: record.generatedAt,
      expires_at: record.expiresAt,
    });

    if (error) {
      throw new Error(`Falha ao registrar evidência no Supabase: ${error.message}`);
    }
  }

  // 2. Salvar localmente (usado como cache de leitura ou quando Supabase desligado)
  const local = readLocalEvidence();
  local.push(record);
  writeLocalEvidence(local);

  return record;
}

/**
 * Vincula uma aprovação manual explícita a uma evidência e URL exata
 */
export async function approveLinkManually(
  userId: string,
  evidenceId: string,
  exactUrl: string
): Promise<{ success: boolean; evidence?: LinkEvidenceRecord; error?: string }> {
  const local = readLocalEvidence();
  const record = local.find((r) => r.id === evidenceId && r.userId === userId);

  if (!record) {
    return { success: false, error: 'Registro de evidência de link não encontrado.' };
  }

  const now = new Date().toISOString();
  record.manualApprovalUserId = userId;
  record.manualApprovalUrl = exactUrl;
  record.manualApprovalAt = now;
  record.verificationStatus = 'verificado';
  record.confirmationSource = 'manual_review_approved';
  record.isAutoDispatchAllowed = true;

  writeLocalEvidence(local);

  // Atualizar Supabase se disponível
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase
        .from('link_evidence_records')
        .update({
          manual_approval_user_id: userId,
          manual_approval_url: exactUrl,
          manual_approval_at: now,
          verification_status: 'verificado',
          confirmation_source: 'manual_review_approved',
          is_auto_dispatch_allowed: true,
        })
        .eq('id', evidenceId)
        .eq('user_id', userId);
    } catch {}
  }

  return { success: true, evidence: record };
}

/**
 * Validação rigorosa do link antes de disparo pelo worker ou agendamento
 * Regra: se o link foi aprovado manualmente, a URL final DEVE ser estritamente igual à manualApprovalUrl.
 * Se a URL tiver sido alterada, a aprovação manual é imediatamente invalidada!
 */
export async function validateEvidenceForDispatch(
  finalUrl: string,
  userId?: string
): Promise<{ valid: boolean; evidence?: LinkEvidenceRecord; reason?: string }> {
  if (!finalUrl || typeof finalUrl !== 'string') {
    return { valid: false, reason: 'URL do link ausente.' };
  }

  const local = readLocalEvidence();
  // Busca evidência correspondente à URL exata
  const candidate = local
    .slice()
    .reverse()
    .find((r) => {
      if (userId && r.userId !== userId) return false;
      return r.finalAffiliateUrl === finalUrl || r.manualApprovalUrl === finalUrl;
    });

  if (!candidate) {
    return {
      valid: false,
      reason: 'Nenhum registro de evidência auditável encontrado para esta URL.',
    };
  }

  // Se a evidência foi revogada
  if (candidate.revokedAt) {
    return {
      valid: false,
      evidence: candidate,
      reason: 'Evidência de link foi revogada.',
    };
  }

  // Se a evidência expirou
  if (candidate.expiresAt && new Date(candidate.expiresAt).getTime() < Date.now()) {
    return {
      valid: false,
      evidence: candidate,
      reason: 'A evidência de validação deste link expirou.',
    };
  }

  // Se a aprovação foi manual, verificar se a URL atual condiz exatamente com a URL aprovada
  if (candidate.confirmationSource === 'manual_review_approved') {
    if (!candidate.manualApprovalUrl) {
      return {
        valid: false,
        evidence: candidate,
        reason: 'Aprovação manual sem registro da URL autorizada.',
      };
    }
    if (candidate.manualApprovalUrl !== finalUrl) {
      return {
        valid: false,
        evidence: candidate,
        reason: `A URL foi modificada após a aprovação manual. A alteração invalida a aprovação prévia. Aprovada: ${candidate.manualApprovalUrl} | Atual: ${finalUrl}`,
      };
    }
  }

  // Verificar se o envio automático ou a confirmação é válida
  if (!candidate.isAutoDispatchAllowed) {
    return {
      valid: false,
      evidence: candidate,
      reason: `Link gerado com status "${candidate.confirmationSource}", que não autoriza publicação automática sem conferência manual.`,
    };
  }

  return { valid: true, evidence: candidate };
}

/**
 * Verifica de forma síncrona se a URL de um trabalho não foi adulterada após aprovação manual
 */
export function checkManualApprovalValidity(
  finalUrl: string,
  userId?: string,
  originalUrl?: string
): { valid: boolean; error?: string } {
  const local = readLocalEvidence();
  for (const r of local) {
    if (userId && r.userId !== userId) continue;
    if (r.confirmationSource === 'manual_review_approved' && r.manualApprovalUrl) {
      const isSameOffer =
        (originalUrl && (r.originalUrl === originalUrl || r.cleanUrl === originalUrl)) ||
        r.finalAffiliateUrl === finalUrl ||
        r.manualApprovalUrl === finalUrl;

      if (isSameOffer && r.manualApprovalUrl !== finalUrl) {
        return {
          valid: false,
          error: `A URL foi modificada após a aprovação manual. A alteração invalida a aprovação. Aprovada: ${r.manualApprovalUrl} | Atual: ${finalUrl}`,
        };
      }
    }
  }
  return { valid: true };
}

/**
 * Lista as evidências mais recentes do usuário para visualização no painel
 */
export async function listRecentEvidence(userId: string, limit = 50): Promise<LinkEvidenceRecord[]> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('link_evidence_records')
        .select('*')
        .eq('user_id', userId)
        .order('generated_at', { ascending: false })
        .limit(limit);

      if (!error && data) {
        return data.map((d: any) => ({
          id: d.id,
          userId: d.user_id,
          storeName: d.store_name,
          productId: d.product_id,
          productTitle: d.product_title,
          originalUrl: d.original_url,
          cleanUrl: d.clean_url,
          finalAffiliateUrl: d.final_affiliate_url,
          confirmationSource: d.confirmation_source,
          verificationStatus: d.verification_status,
          isAutoDispatchAllowed: d.is_auto_dispatch_allowed,
          generatedAt: d.generated_at,
          expiresAt: d.expires_at,
          manualApprovalUserId: d.manual_approval_user_id,
          manualApprovalUrl: d.manual_approval_url,
          manualApprovalAt: d.manual_approval_at,
          revokedAt: d.revoked_at,
        }));
      }
    } catch {}
  }

  const local = readLocalEvidence();
  return local
    .filter((r) => r.userId === userId)
    .slice(-limit)
    .reverse();
}

