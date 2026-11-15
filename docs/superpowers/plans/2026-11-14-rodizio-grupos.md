# Rodízio de grupos do /grupo — plano

> **Para agentes:** use superpowers:executing-plans. Os passos usam checkbox (`- [ ]`).

**Objetivo:** `/grupo/entrar` redireciona o visitante ao primeiro grupo `#N` do Radar que tenha menos de 800 membros.

**Arquitetura:**
- Um módulo puro (`group-rotation.ts`) escolhe o grupo a partir da lista de grupos.
- Uma camada fina com efeitos (`group-rotation-live.ts`) busca os grupos da conta do dono pelo catálogo do copiador, pega o convite pelo gateway, guarda em cache por 60 s e avisa pelo ntfy.

**Tecnologias:** Next.js App Router (route handler), Evolution API, `node:test` + tsx.

**Spec:** `docs/superpowers/specs/2026-11-14-rodizio-grupos-design.md`

## Restrições globais
- O limite padrão é 800, configurável por `GROUP_ROTATION_LIMIT`. O aviso dispara em 700 (`GROUP_ROTATION_WARN`).
- Só entram grupos cujo nome termina em `#<número>` (pode haver espaço antes do #). A ordem é pelo número.
- Conta dona: `00000000-0000-0000-0000-000000000001`, com role admin.
- O link de reserva é o atual da página: `https://chat.whatsapp.com/BU0EXrYHWFk2qLdmqopMTs`.
- A rota nunca responde com erro: sempre faz um redirecionamento 302 para algum convite.

## Pontos de revisão
- Todos os grupos cheios → usa o último da fila (o teto de 1024 do WhatsApp ainda dá folga) e avisa.
- Nome com "#10" deve ficar depois do "#9" (ordenação numérica, não alfabética).
- Gateway fora do ar → último link bom em memória; se não houver, o link fixo.
- Um nome como "Grupo #3 VIP" não termina em #N, então fica fora da fila.

---

### Task 1: Escolha do grupo (puro)

**Arquivos:** criar `src/lib/server/group-rotation.ts` e `tests/group_rotation.test.ts`.

**Interfaces produzidas:**
- `rotationQueue(groups: {groupJid:string; name:string; participantCount:number}[]): {groupJid:string; name:string; participantCount:number; number:number}[]`, com o regex `/#\s*(\d{1,3})\s*$/` e ordenação crescente pelo número.
- `pickRotationGroup(queue, limit:number): { group; needsNew: boolean } | null`:
  - Devolve o primeiro grupo com `participantCount < limit`; se nenhum tiver vaga, o último da fila.
  - `needsNew` é true quando o último da fila tem `participantCount >= warn`, que vem por parâmetro: `pickRotationGroup(queue, limit, warn)`.

- [ ] Testes:
  - ordena #1, #2, #10 numericamente;
  - ignora "Radar Ofertas" e "Grupo #3 VIP";
  - com #1=800 e #2=10, escolhe o #2;
  - com todos ≥800, escolhe o último;
  - `needsNew` é true com o último em 700 e false com 699;
  - fila vazia devolve null.
- [ ] Rodar e ver falhar; implementar; rodar e ver passar.

### Task 2: Rota ao vivo + página

**Arquivos:**
- Criar `src/lib/server/group-rotation-live.ts` e `src/app/grupo/entrar/route.ts`.
- Modificar `src/app/grupo/page.tsx`: os links dos botões passam para `/grupo/entrar`.

**Interfaces:**
- `resolveRotationInvite(): Promise<string>`:
  - Usa a sessão sintética da conta dona e chama `copierGroupCatalog(session, {})`, de onde vêm os grupos e a conexão.
  - Aplica `rotationQueue` e `pickRotationGroup`.
  - Pega o convite com `photoGatewayRequest(connection, /group/inviteCode/<instance>?groupJid=<jid>)` e lê `inviteUrl` (ou `inviteCode` → `https://chat.whatsapp.com/<code>`).
  - Cache de 60 s em memória e último link bom guardado em memória; em qualquer erro, devolve o último bom ou o link fixo.
  - O cache de convite por jid dura 10 min.
- Aviso ntfy quando `needsNew`: título "Crie o grupo #N+1" e o corpo com a contagem; deduplicado em memória por 12 h.
- `GET` em `route.ts` → `NextResponse.redirect(await resolveRotationInvite(), 302)`, com `dynamic = 'force-dynamic'` e `Cache-Control: no-store`.

- [ ] `npm run build` passa.
- [ ] Em produção, o `curl -I` de `/grupo/entrar` devolve 302 para `chat.whatsapp.com/...` (do grupo #1).
- [ ] Commit e push.
