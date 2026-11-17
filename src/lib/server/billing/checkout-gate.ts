/**
 * Quem pode iniciar uma assinatura agora. Devolve a mensagem de bloqueio, ou null se pode seguir.
 * - Modo teste: só o administrador (os clientes veriam um checkout de teste que não conseguem pagar).
 * - Modo produção: só com os dados do prestador preenchidos (Decreto 7.962/2013 exige identificação).
 */
export function checkoutGate(env: 'test' | 'production', role: 'admin' | 'user', dadosDoPrestadorPendentes: boolean): string | null {
  if (env === 'test' && role !== 'admin') {
    return 'As assinaturas abrem em breve. Enquanto isso, você continua usando o plano atual normalmente.';
  }
  if (env === 'production' && dadosDoPrestadorPendentes) {
    return 'As assinaturas abrem em breve. Estamos finalizando os dados de cobrança.';
  }
  return null;
}
