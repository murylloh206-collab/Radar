import { PublicationJob, StoreCredential, StoreName, WhatsAppGroup } from '../types';
import { DatabaseSchema } from './storage';
import { detectStoreFromUrl } from './url-resolver';
import { checkManualApprovalValidity } from './link-evidence';

export interface JobValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validação rigorosa no servidor para publicação e aprovação de jobs.
 * Garante:
 * 1. Ausência total de dados de demonstração ou exemplo (isDemo, JIDs ou URLs fictícias)
 * 2. Destino existente, autorizado e com permissão verificada no WhatsApp
 * 3. Oferta real com texto estruturado
 * 4. Link próprio de afiliado devidamente formatado com identificadores da conta do usuário (NUNCA link original de terceiros)
 */
export function validateJobForDispatch(job: PublicationJob, db: DatabaseSchema): JobValidationResult {
  // 1. Ausência de demonstração ou testes fictícios
  if (job.isDemo === true) {
    return {
      valid: false,
      error: 'Trabalho marcado como demonstração (demo) não pode ser aprovado nem publicado.',
    };
  }

  // JIDs fictícios proibidos
  const lowerJid = (job.targetJid || '').toLowerCase();
  if (
    !lowerJid ||
    lowerJid.includes('55555555') ||
    lowerJid.includes('88888888') ||
    lowerJid.includes('123456789') ||
    lowerJid.includes('demo') ||
    lowerJid.includes('fake')
  ) {
    return {
      valid: false,
      error: `Identificador de grupo de destino inválido ou fictício: "${job.targetJid}".`,
    };
  }

  // 2. Destino válido e grupo autorizado com permissão confirmada
  const targetGroup = (db.groups || []).find((g: WhatsAppGroup) => g.groupJid === job.targetJid);
  if (!targetGroup) {
    return {
      valid: false,
      error: `Grupo de destino "${job.targetJid}" não encontrado no cadastro de grupos do WhatsApp.`,
    };
  }

  if (targetGroup.canPost !== true) {
    return {
      valid: false,
      error: `Grupo "${targetGroup.name}" não possui autorização ou permissão de envio (canPost=false).`,
    };
  }

  const isPermissionVerified =
    targetGroup.permissionStatus === 'verified_admin' || targetGroup.permissionStatus === 'verified_member';

  if (!isPermissionVerified) {
    return {
      valid: false,
      error: `Grupo "${targetGroup.name}" possui permissão não confirmada no WhatsApp (status: ${targetGroup.permissionStatus || 'não verificado'}).`,
    };
  }

  // 3. Oferta real com conteúdo
  if (!job.messageText || job.messageText.trim().length < 15) {
    return {
      valid: false,
      error: 'Mensagem da oferta insuficiente ou vazia.',
    };
  }

  // Bloquear texto contendo identificadores fictícios de demonstração
  if (job.messageText.includes('MLB12345678') || job.messageText.includes('exemplo.com')) {
    return {
      valid: false,
      error: 'Mensagem contém referências a dados de teste fictícios (MLB12345678 / exemplo).',
    };
  }

  // Bloquear ofertas com preço R$ 0,00 ou inválido
  if (
    job.messageText.includes('R$ 0,00') ||
    job.messageText.includes('R$ 0.00') ||
    job.messageText.includes('Por apenas R$ 0')
  ) {
    return {
      valid: false,
      error: 'Oferta com preço zerado (R$ 0,00) ou inconsistente. Envio bloqueado para revisão.',
    };
  }

  // 4. Link próprio de afiliado confirmado (NUNCA link original de terceiros)
  const affiliateUrl = job.affiliateUrl?.trim();
  if (!affiliateUrl) {
    return {
      valid: false,
      error: 'Trabalho sem link de afiliado configurado. Não é permitido publicar sem link próprio.',
    };
  }

  const store = detectStoreFromUrl(affiliateUrl);
  if (!store) {
    return {
      valid: false,
      error: `Link "${affiliateUrl}" não pertence a nenhuma loja suportada pelo Radar de Ofertas.`,
    };
  }

  // Bloqueio de qualidade por palavras proibidas da loja
  const storeRule = (db.rules || []).find((r) => r.storeName === store);
  if (storeRule && Array.isArray(storeRule.blockedKeywords)) {
    for (const kw of storeRule.blockedKeywords) {
      if (kw && job.messageText.toLowerCase().includes(kw.toLowerCase())) {
        return {
          valid: false,
          error: `Mensagem contém palavra bloqueada pelas regras de qualidade: "${kw}".`,
        };
      }
    }
  }

  const storeCreds = (db.stores || []).find((s: StoreCredential) => s.storeName === store);
  if (!storeCreds || !storeCreds.isActive) {
    return {
      valid: false,
      error: `Credenciais de afiliado não configuradas ou inativas para a loja ${store.toUpperCase()}.`,
    };
  }

  // 4.1 Verificar integridade de aprovação manual
  const manualCheck = checkManualApprovalValidity(affiliateUrl, job.userId, job.originalUrl);
  if (!manualCheck.valid) {
    return {
      valid: false,
      error: manualCheck.error || 'Aprovação manual invalidada devido à alteração da URL.',
    };
  }

  // Verificar presença dos identificadores oficiais da conta no link
  try {
    const parsed = new URL(affiliateUrl);

    if (store === 'mercadolivre') {
      const isSecShortLink = parsed.pathname.startsWith('/sec/');
      if (isSecShortLink) {
        // Exigência: link /sec/ sozinho NÃO prova titularidade da conta.
        // Deve possuir registro de evidência auditável no banco ou aprovação manual explícita da URL exata.
        if (!manualCheck.valid) {
          return {
            valid: false,
            error: 'O link curto /sec/ do Mercado Livre não possui comprovação auditável de geração pela conta do usuário. Encaminhado para revisão manual.',
          };
        }
      } else {
        const tool = parsed.searchParams.get('matt_tool');
        const word = parsed.searchParams.get('matt_word');
        const expectedTool = storeCreds.appId?.trim();
        const expectedWord = storeCreds.affiliateTag?.trim();

        if (!word) {
          return {
            valid: false,
            error: 'Link do Mercado Livre não possui parâmetro oficial de afiliado (matt_word ausente). É proibido publicar link original.',
          };
        }

        if (expectedTool && (!tool || tool !== expectedTool)) {
          return {
            valid: false,
            error: `Parâmetro matt_tool (${tool || 'ausente'}) diverge do ID configurado para sua conta (${expectedTool}).`,
          };
        }

        if (expectedWord && word !== expectedWord) {
          return {
            valid: false,
            error: `Parâmetro matt_word (${word}) diverge da tag de rastreio da sua conta (${expectedWord}).`,
          };
        }
      }
    } else if (store === 'shopee') {
      const isShortLink = parsed.hostname.includes('shope.ee') || parsed.hostname.includes('s.shopee.com.br');
      const subIdParam = parsed.searchParams.get('utm_campaign') || parsed.searchParams.get('sub_id');
      const expectedSubId = storeCreds.affiliateTag?.trim();

      if (isShortLink && !subIdParam) {
        // Exigência: link curto da Shopee sem Sub-ID na query exige comprovação auditável da conta
        if (!manualCheck.valid) {
          return {
            valid: false,
            error: 'O link curto da Shopee não possui tag da conta nem evidência auditável de geração pela sua integração. Encaminhado para revisão manual.',
          };
        }
      } else if (!isShortLink && !subIdParam) {
        return {
          valid: false,
          error: 'Link da Shopee não possui parâmetros de Sub-ID. Proibido publicar link original de terceiro.',
        };
      } else if (subIdParam && expectedSubId && subIdParam !== expectedSubId) {
        return {
          valid: false,
          error: `Sub-ID da Shopee (${subIdParam}) diverge da tag configurada para sua conta (${expectedSubId}).`,
        };
      }
    } else if (store === 'netshoes') {
      const isRakutenDeeplink = parsed.hostname.includes('linksynergy.com');
      const idParam = parsed.searchParams.get('id');
      const midParam = parsed.searchParams.get('mid');
      const expectedSiteId = storeCreds.affiliateTag?.trim();
      const expectedMid = storeCreds.appId?.trim();

      if (!isRakutenDeeplink || !idParam || !midParam) {
        return {
          valid: false,
          error: 'Link da Netshoes não é um deeplink oficial Rakuten LinkShare com ID e Merchant ID. Proibido publicar link original.',
        };
      }

      if (expectedSiteId && idParam !== expectedSiteId) {
        return {
          valid: false,
          error: `Site ID Rakuten (${idParam}) diverge do configurado para sua conta (${expectedSiteId}).`,
        };
      }

      if (expectedMid && midParam !== expectedMid) {
        return {
          valid: false,
          error: `Merchant ID Rakuten (${midParam}) diverge do configurado para sua conta (${expectedMid}).`,
        };
      }
    } else if (store === 'amazon') {
      const tag = parsed.searchParams.get('tag');
      const expectedTag = storeCreds.affiliateTag?.trim();

      if (!tag) {
        return {
          valid: false,
          error: 'Link da Amazon não possui tag de afiliado (tag ausente). Proibido publicar link original.',
        };
      }

      if (expectedTag && tag !== expectedTag) {
        return {
          valid: false,
          error: `Tag da Amazon (${tag}) diverge da tag da sua conta (${expectedTag}).`,
        };
      }
    } else if (store === 'magalu') {
      const subId = parsed.searchParams.get('sub_id');
      const expectedSubId = storeCreds.affiliateTag?.trim();

      if (!subId) {
        return {
          valid: false,
          error: 'Link do Magazine Luiza não possui identificador de afiliado (sub_id ausente). Proibido publicar link original.',
        };
      }

      if (expectedSubId && subId !== expectedSubId) {
        return {
          valid: false,
          error: `Identificador Magalu (${subId}) diverge do configurado para sua conta (${expectedSubId}).`,
        };
      }
    }
  } catch {
    return {
      valid: false,
      error: 'URL de afiliado com formato malformado ou inválido.',
    };
  }



  return { valid: true };
}
