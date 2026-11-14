import test from 'node:test';
import assert from 'node:assert/strict';
import { isRetryableFailure, selectRepostCandidates, MAX_REPOST_ATTEMPTS } from '../src/lib/server/copier-repost';

const NOW = new Date('2026-11-14T14:30:00Z').getTime();
const ts = (minAgo: number) => Math.floor((NOW - minAgo * 60e3) / 1000);
const row = (over: any = {}) => ({
  id: 'i1', status: 'completed',
  payload: { data: { key: { id: 'M1' }, messageTimestamp: ts(30) } },
  result: { reason: 'Oferta bloqueada — não foi possível confirmar link próprio de afiliado (AMAZON): Credenciais de afiliado não configuradas ou inativas para AMAZON.' },
  jobs: [] as any[],
  ...over,
});

test('erros corrigíveis entram na repostagem', () => {
  assert.equal(isRetryableFailure(row()), true);
  assert.equal(isRetryableFailure(row({ result: { reason: 'Oferta bloqueada — não foi possível confirmar link próprio de afiliado (MERCADOLIVRE): Sessão do Mercado Livre expirou. Reconecte pela extensão.' } })), true);
  assert.equal(isRetryableFailure(row({ result: { reason: 'Falha na conversão de link próprio: Erro ao resolver link: Falha na resolução da URL: This operation was aborted' } })), true);
  assert.equal(isRetryableFailure(row({
    result: { reason: 'Oferta encaminhada para fila de revisão manual conforme configuração da origem.' },
    jobs: [{ status: 'aguardando_aprovacao', error_details: 'Fotografia do produto indisponível. Publicação sem imagem bloqueada para proteção de qualidade.' }],
  })), true);
  assert.equal(isRetryableFailure(row({
    result: { reason: 'Oferta encaminhada para fila de revisão manual conforme configuração da origem.' },
    jobs: [{ status: 'aguardando_aprovacao', error_details: 'Mensagem sem preço da oferta. Envio automático bloqueado para revisão.' }],
  })), true);
});

test('o que não é erro não reposta', () => {
  for (const reason of [
    'Falha na conversão de link próprio: Loja não suportada ou domínio não reconhecido.',
    'Oferta duplicada bloqueada: este mesmo produto/link já foi enviado ou agendado recentemente.',
    'Mensagem fora das origens ativas desta conta. Nenhum envio criado.',
    'Assinatura inativa ou vencida: assine ou renove um plano em /planos para voltar a enviar automático.',
  ]) assert.equal(isRetryableFailure(row({ result: { reason } })), false, reason);
  // revisão manual pela configuração da origem (sem erro) não reposta
  assert.equal(isRetryableFailure(row({ result: { reason: 'Oferta encaminhada para fila de revisão manual conforme configuração da origem.' }, jobs: [{ status: 'aguardando_aprovacao', error_details: null }] })), false);
  // já foi enviada: nunca reposta
  assert.equal(isRetryableFailure(row({ jobs: [{ status: 'enviado' }] })), false);
});

test('só ofertas com até 2 horas e até o limite de tentativas', () => {
  const fresh = row({ id: 'a' });
  const old = row({ id: 'b', payload: { data: { key: { id: 'M2' }, messageTimestamp: ts(130) } } });
  const tired = row({ id: 'c', payload: { data: { key: { id: 'M3' }, messageTimestamp: ts(20) }, radarRepostCount: MAX_REPOST_ATTEMPTS } });
  const pending = row({ id: 'd', status: 'pending' });
  assert.deepEqual(selectRepostCandidates([fresh, old, tired, pending], NOW).map(r => r.id), ['a']);
});
