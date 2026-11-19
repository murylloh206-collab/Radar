import { ADMIN_UUID } from '@/lib/server/auth';

/**
 * O assistente é exclusivo da conta dona da plataforma (diferencial dos grupos do dono, decisão de 19/11):
 * não é vendido em nenhum plano, não aparece para clientes e não responde em conexões de clientes.
 */
export const isAssistantOwner = (userId: string | null | undefined): boolean => Boolean(userId) && userId === ADMIN_UUID;
