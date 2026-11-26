# Design — Tela "Minhas entregas" do voluntário com linha de progresso

## Intenção
O usuário quer uma tela separada para "pegar a encomenda", com uma linha de
progresso no estilo "seu pedido está sendo enviado". Confirmou: é tela do
voluntário, com dados reais do Supabase, e pediu para não escrever testes.

## Estado atual
- `pages/voluntario.html` é o feed de coletas disponíveis (RN-04/RN-07).
- `pages/oferta.html` já tem timeline técnica (chips Publicada→Confirmada e
  histórico de eventos), genérica para todos os perfis.
- Usuários reais no banco: `teste@gmail.com` (Vol Teste, voluntário, vínculo em
  `public.voluntarios`) e `cleber.andrade@email.com` (doador, vínculo em
  `public.doadores`). As ofertas `[TESTE]` anteriores expiraram.

## Abordagens
1. **Página nova `entregas.html` + módulo `entregas.js` (escolhida)** — home
   separada do voluntário, lista de entregas atribuídas a ele com progresso
   estilo entrega (Preparando → A caminho → Entregue → Confirmada). Liga ao
   feed real via `voluntario_id` e ao histórico `historico_status`. Mantém
   `voluntario.html` como feed de coletas disponíveis.
2. **Aba dentro de `voluntario.html`** — menos arquivos, mas não é "tela a
   parte" como pedido. Descartada.
3. **Reaproveitar `oferta.html`** — já é o detalhe, mas o foco é a oferta e não
   a jornada do voluntário; o copy é técnico. Descartada.

## Decisões
- Tela nova: `pages/entregas.html`, módulo `pages-js/entregas.js`, estilos em
  `css/stily.css` (padrão `.page-shell`, `.card`, chips e ícones Lucide).
- Progresso com 4 etapas amigáveis mapeadas do status real:
  `aceita` → "Coleta confirmada", `coletada` → "A caminho",
  `entregue` → "Entregue na instituição", `confirmada` → "Confirmado!".
  `publicada` com voluntário atribuído → "Preparando coleta".
- Dados de demonstração: migration SQL idempotente acrescentando ofertas
  atribuídas ao voluntário `Vol Teste`, do doador `cleber`, em estados
  diferentes (aceita, coletada, entregue), prazos no futuro e histórico de
  status compatível. Nenhum usuário novo, nenhuma senha criada.
- Nav: link "Entregas" com ícone `truck` na home do voluntário; nas demais
  páginas o link permanece onde faz sentido (sem quebrar `aria-current`).
- Sem testes automatizados, por pedido explícito do usuário. Verificação é
  manual no browser publicado + consulta SQL dos dados.

## Fora de escopo
- Alterar regras de negócio, RLS, migrations já aplicadas ou credenciais.
- Criar contas de teste (já existem).
