# Rodízio de grupos do /grupo — design (aprovado)

**Por quê:** o dono vai investir em tráfego pago e pode receber mais de 5.000 pessoas. Um grupo comporta 1024 membros, e a meta é não passar de cerca de 800 por grupo.

**Objetivo:** o botão do `/grupo` envia cada visitante ao primeiro grupo da fila que tenha vaga, enchendo um grupo de cada vez.

**Abordagens consideradas**
- (A) O dono cria os grupos e o sistema faz o rodízio. **Escolhida**: mais controle e menos risco de bloqueio do número.
- (B) O sistema cria o próximo grupo sozinho. Rejeitada: criar grupos por automação é algo que o WhatsApp vigia.
- Sorteio aleatório entre os grupos. Rejeitado: espalha as pessoas e todos os grupos parecem vazios.

**Design**
- **Fila:** grupos do número do Radar cujo nome termina em `#N`, ordenados por N. São detectados sozinhos: hoje existem do #1 ao #5, e grupos novos com #6, #7… entram automaticamente.
  - Decisão minha: o dono já sinalizou os grupos com # no nome, então a seção de configuração no painel não é necessária na v1.
- **Rota `GET /grupo/entrar`:**
  - Escolhe o primeiro grupo da fila com menos de `GROUP_ROTATION_LIMIT` membros (padrão 500).
  - Pega o link de convite pelo gateway (`/group/inviteCode`) e responde com redirecionamento 302.
  - Cache de cerca de 60 s.
- **Contagem:** membros reais via `fetchAllGroups`, da conexão do dono (ADMIN_UUID).
- **Reserva:** se o gateway falhar ou todos os grupos estiverem cheios, usa o último link que funcionou; se ainda não houver nenhum, usa o link fixo atual.
- **Aviso (ntfy):** quando o último grupo da fila passar de 400 membros, avisa "crie o #N+1". No máximo uma vez a cada 12 h.
- **Página:** os botões do `/grupo` passam a apontar para `/grupo/entrar`. O visual não muda.

**Fora do escopo:** criar grupos automaticamente e incluir os grupos novos como destino do copiador (isso continua manual, pelo painel).
