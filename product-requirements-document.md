---
document_type: product-requirements-document
project: arena-eleggante
language: pt-BR
status: approved
---

# PRD: Arena Eleggante

## 1. Visão do produto

Arena Eleggante será uma aplicação web para planejar, administrar e acompanhar torneios de EA FC promovidos pela Barbershop Eleggante. O produto substituirá o controle descentralizado entre ferramentas como Arena17, planilhas e comunicação manual, oferecendo uma experiência pública para participantes e espectadores, além de uma área restrita para a operação do torneio.

O sistema será criado primeiro para a Eleggante, mas todo torneio, usuário organizador e configuração de marca pertencerá formalmente a uma organização. Na primeira versão haverá somente a organização Barbershop Eleggante, sem autoatendimento ou operação para terceiros; essa estrutura prepara a evolução futura sem alterar as regras de torneio. A primeira versão não terá cobrança, pagamento dentro da plataforma ou integração de confirmação de pagamento.

As referências funcionais iniciais são os torneios da Eleggante no Arena17 e a planilha Copa Global de 24 participantes. Elas orientam fluxos e necessidades, mas não devem ser copiadas visualmente, tecnicamente ou em conteúdo.

## 2. Objetivos

- Centralizar inscrições, participantes, confrontos, resultados, classificação, chave eliminatória e regulamento.
- Permitir torneios presenciais e online com o mesmo núcleo de gestão.
- Dar transparência pública a torneios com inscrições abertas ou em andamento.
- Reduzir erro manual no cálculo de classificação e formação de chaves.
- Preservar controle da Eleggante sobre aprovação de participantes e publicação de resultados.
- Aplicar a identidade visual oficial da Barbershop Eleggante em toda a experiência.

## 3. Fora de escopo da primeira versão

- Cobrança, checkout, links de pagamento, confirmação de PIX, cartão ou qualquer outro meio de pagamento.
- Sincronização automática de resultados com EA FC, PlayStation, PlayStation Plus ou APIs de terceiros.
- Aplicativo nativo para celular.
- Marketplace ou autoatendimento para organizadores externos.
- Permissões granulares além dos papéis definidos neste documento.
- Internacionalização além de pt-BR.
- Construtor de campos adicionais para formulários de inscrição; a V1 usa somente os campos definidos neste documento.
- E-mails de marketing ou campanhas promocionais.

## 4. Usuários e permissões

| Papel | Permissões principais |
| --- | --- |
| Administrador da Plataforma | Acesso administrativo global a todas as organizações e torneios, inclusive para criar a primeira organização e seu primeiro Proprietário, sem alterar resultados, pódio ou estatísticas de torneios Encerrados nem decidir sobre a própria inscrição ou partida. |
| Proprietário | Acesso total à organização, usuários organizadores, torneios, configurações e histórico. |
| Organizador | Cria e opera torneios atribuídos a ele, aprova inscrições, administra grupos e partidas, revisa evidências, resolve disputas e publica resultados. |
| Jogador | Cria perfil, inscreve-se, joga com a equipe ou seleção escolhida, acompanha torneios e envia sugestão de resultado apenas de suas partidas. |
| Visitante | Consulta informações públicas e resultados publicados sem autenticação. |

O primeiro Administrador da Plataforma é criado por um processo de inicialização controlado e pode cadastrar a primeira organização e seu primeiro Proprietário. Uma organização pode ter vários Proprietários; um Proprietário pode adicionar outros Proprietários. Toda visibilidade ou ação reservada ao Proprietário neste documento também se aplica ao Administrador da Plataforma em qualquer organização, respeitando as mesmas regras de estado e auditoria. O acesso administrativo global inclui histórico e dados privados necessários à operação; as notificações endereçadas ao Proprietário continuam destinadas aos Proprietários da organização.

Um mesmo usuário autenticado pode ser jogador e administrador, conforme seus papéis. A unidade competitiva é sempre o jogador, identificado pelo seu identificador da Arena Eleggante; a equipe ou seleção é apenas a escolha usada por ele nas partidas. Cada inscrição possui exatamente um responsável autenticado, que representa sua própria participação e é o único jogador autorizado a sugerir resultados em seu nome na primeira versão. Jogadores não podem aprovar ou publicar resultados. Um administrador que também participe do torneio não pode aprovar ou rejeitar sua própria inscrição, decidir disputa, registrar W.O., publicar ou corrigir resultado de sua própria partida; essas ações exigem outro administrador autorizado que não participe da decisão. Nem o Administrador da Plataforma pode alterar resultados, pódio ou estatísticas após o encerramento.

## 5. Autenticação e perfil de jogador

O acesso autenticado deve oferecer:

- Login por código único enviado por e-mail.
- Login com conta Google.
- Perfil com nome de exibição, nome de usuário único na Arena Eleggante, identificador público sequencial, legível e imutável da Arena Eleggante no formato `AE-000123`, e-mail e telefone obrigatório como único canal de contato exigido.
- Para torneios online, armazenamento de EA ID e PSN ID quando solicitado pelo torneio.

O e-mail verificado é a identidade primária do usuário. Login por Google e por código único com o mesmo e-mail verificado acessam automaticamente a mesma conta; o sistema não cria uma segunda conta para esse e-mail. O nome de usuário e o identificador da Arena Eleggante compõem sua identidade pública e aparecem juntos em páginas públicas; EA ID e PSN ID são identificadores externos e podem ser solicitados por torneio. Antes do primeiro acesso autenticado ou inscrição, o jogador deve aceitar os Termos de Uso e o Aviso de Privacidade; o sistema registra a versão, data e horário do consentimento. Quando esses documentos forem atualizados, o jogador deve aceitar a nova versão antes do próximo acesso autenticado ou inscrição, sem interromper sessões já em andamento. O sistema deve evitar contas e inscrições duplicadas para o mesmo torneio, sem impedir que um usuário participe de torneios diferentes.

## 6. Ciclo de vida e calendário do torneio

Cada torneio terá os estados abaixo:

| Estado | Comportamento |
| --- | --- |
| Rascunho | Visível somente para Proprietário e Organizadores autorizados. Configuração pode mudar livremente. |
| Aguardando aprovação | Visível somente para Proprietário e Organizadores autorizados. Um novo torneio criado por Organizador aguarda aprovação do Proprietário antes de poder abrir inscrições ao público. |
| Reprovado | Visível somente para Proprietário e Organizadores autorizados. O Proprietário registra uma justificativa e o Organizador é notificado. O Organizador não pode editar ou reenviar esse torneio. O Proprietário pode excepcionalmente devolvê-lo a Rascunho para ajuste e novo envio à aprovação, ou liberá-lo diretamente para Inscrições abertas quando o motivo tiver sido resolvido externamente. |
| Inscrições abertas | Público e acessível. Jogadores podem enviar solicitação de inscrição. |
| Inscrições encerradas | Público e acessível. Não aceita novas solicitações. Organização finaliza participantes, formato e sorteio. |
| Em andamento | Público e acessível. Partidas, resultados publicados, classificação e chave são atualizados conforme a operação. |
| Suspenso | Aplicável somente a torneio em andamento e acionado pelo Proprietário com justificativa obrigatória. Interrompe a operação, bloqueia inscrições, sugestões e publicação ou alteração de resultados, e permanece público em modo somente leitura, com aviso destacado de suspensão e justificativa. Participantes aprovados recebem notificação por e-mail. Somente o Proprietário pode retomar o torneio para Em andamento. |
| Encerrado | Público e acessível conforme configuração. Exibe campeão, pódio e histórico final. É imutável na V1: resultados, pódio e estatísticas não podem ser alterados. |
| Cancelado | Estado terminal, público com justificativa e sem campeão. Somente o Proprietário pode cancelar um torneio após seu início; participantes aprovados recebem notificação por e-mail. |
| Arquivado | Não aparece nas listagens públicas padrão, mas permanece acessível por URL direta em modo somente leitura. Mantém dados para consulta administrativa. |

Um novo torneio criado por Organizador deve receber aprovação explícita do Proprietário antes de abrir inscrições ao público. A reprovação exige justificativa e notificação ao Organizador. Um torneio reprovado fica bloqueado para alterações do Organizador; o Proprietário pode devolvê-lo a Rascunho para ajuste e novo ciclo de aprovação ou liberá-lo diretamente para Inscrições abertas. Um torneio não pode iniciar enquanto não houver configuração válida de participantes, formato, fases e critérios de desempate. A configuração estrutural fica bloqueada após o início. Para mudá-la, o organizador deve retornar explicitamente o torneio ao estado anterior apropriado, invalidar as fases afetadas e gerar registro de auditoria. O estado Encerrado é imutável na V1: nenhum resultado, pódio ou estatística pode ser alterado depois dele.

O organizador escolhe entre dois modos de calendário:

- Evento de um dia: data do evento e horários das partidas são opcionais. O sistema prioriza a ordem dos confrontos e a operação ao vivo.
- Torneio de múltiplos dias: datas de início e fim são obrigatórias. Cada partida pode receber data e horário, respeitando o período configurado.

## 7. Inscrições e participantes

### 7.1 Fluxo de inscrição

1. Visitante acessa a página pública do torneio com inscrições abertas.
2. Autentica-se por e-mail OTP ou Google.
3. Preenche dados exigidos pelo torneio.
4. Envia solicitação de inscrição.
5. Organizador aprova, rejeita ou mantém a solicitação pendente. Aprovação e rejeição notificam o jogador por e-mail; a rejeição exige justificativa.
6. Participantes aprovados ocupam vagas disponíveis e aparecem na lista pública conforme configuração do torneio. Ao atingir a capacidade, novas solicitações permanecem pendentes como lista de espera até que uma vaga seja liberada ou as inscrições sejam encerradas. A lista de espera é ordenada pela data de inscrição e o organizador escolhe manualmente qual solicitação pendente aprovar; não há promoção automática.

O sistema não deve inferir nem confirmar pagamento. O organizador resolve qualquer pagamento fora da plataforma antes de aprovar ou rejeitar a inscrição.

### 7.2 Dados da inscrição

- Nome do responsável, nome de usuário e identificador da Arena Eleggante, obtidos do perfil autenticado.
- Telefone obrigatório como meio de contato.
- Nome da equipe ou seleção, obrigatório quando o participante a escolhe; preenchido pela Arena Eleggante após o sorteio quando o torneio usa sorteio de equipes ou seleções.
- Tipo de equipe permitido: somente clubes, somente seleções ou ambos, configurado pelo torneio. A escolha usa um catálogo pré-carregado da Arena Eleggante: clubes exibem nome e emblema; seleções exibem nome e bandeira do país.
- EA ID e PSN ID para torneios online, quando solicitados.
- Observações do participante.

Cada torneio também define como a equipe ou seleção é atribuída a partir do catálogo pré-carregado:

- Escolha do participante: o jogador escolhe uma equipe ou seleção permitida ao se inscrever.
- Sorteio de equipes: o administrador cadastra a lista de equipes ou seleções elegíveis, e a Arena Eleggante as sorteia sem repetição entre os participantes aprovados. A lista deve conter ao menos tantas opções quanto participantes aprovados.

Mais de um participante pode escolher a mesma equipe ou seleção quando essa escolha cabe ao participante; ela não é uma identidade competitiva única. Quando a equipe ou seleção é sorteada, não há repetição entre participantes. O torneio define se o jogador pode alterar a equipe ou seleção durante a competição; quando permitido, a alteração pode ocorrer a qualquer momento. A lista de participantes exibe a escolha atual, enquanto resultados e chave histórica preservam a equipe ou seleção usada em cada partida já registrada. Toda alteração deve ficar registrada no histórico.

## 8. Formatos de competição

### 8.1 Princípios

O organizador informa a quantidade máxima de participantes, limitada a 32, e a quantidade de grupos. A Arena Eleggante calcula e valida a configuração antes de permitir o sorteio e o início do torneio. Mata-mata direto só é permitido com 4, 8 ou 16 participantes; a maior fase eliminatória da V1 é oitavas de final.

O sistema suporta:

- Mata-mata direto.
- Fase de grupos seguida por mata-mata.
- Jogos de grupo em turno único ou ida e volta.
- Configuração de grupos, quantidade de classificados por grupo e classificação adicional por posição, como melhores terceiros, melhores sextos ou qualquer outra posição elegível.
- Configuração opcional de terceiro lugar. Quando habilitado, o organizador define se ele será decidido por partida entre os perdedores das semifinais ou pela melhor campanha. Sem terceiro lugar habilitado, o produto não exibe terceiro colocado.
- Mata-mata em ida e volta, com uma das opções: todas as fases incluindo a final, ou todas as fases anteriores à final com final em jogo único.

A fase eliminatória só pode iniciar com chave de 4, 8 ou 16 classificados. A Arena Eleggante deve bloquear configuração inválida, verificando que a quantidade de participantes é divisível pela quantidade de grupos e que a soma dos classificados fixos por grupo com os classificados adicionais por posição resulta exatamente em 4, 8 ou 16. Exemplo válido: 18 participantes, 3 grupos de 6, 5 classificados fixos por grupo e 1 melhor sexto colocado, totalizando 16 classificados.

### 8.2 Fase de grupos

Para cada grupo, o sistema gera confrontos de todos contra todos em turno único ou ida e volta, conforme configurado no torneio. A classificação deve registrar, no mínimo:

- Jogos.
- Vitórias, empates e derrotas.
- Pontos.
- Gols ou pontos a favor e contra.
- Saldo.
- Percentual de aproveitamento.
- Posição no grupo.

A pontuação é fixa na V1: 3 pontos por vitória, 1 por empate e 0 por derrota. Regras de pontuação, efeitos de W.O. e critérios de desempate não são configuráveis nesta versão; poderão evoluir somente quando a especificação técnica garantir que todos os cálculos e critérios permanecem consistentes.

### 8.3 Desempate e classificados adicionais

O regulamento do torneio deve declarar a ordem fixa de critérios de desempate: pontos, vitórias, saldo, gols a favor e decisão manual do organizador quando ainda houver empate.

Quando a configuração usar classificados adicionais por posição, como melhores terceiros ou melhores sextos, o sistema deve comparar apenas os participantes elegíveis naquela posição, aplicar os critérios declarados e preencher a quantidade necessária para a chave eliminatória. Se o último critério ainda empatar participantes, o organizador deve resolver e registrar a decisão antes de liberar a próxima fase. Quando o terceiro lugar for habilitado sem partida, a Arena Eleggante compara os perdedores das semifinais pela classificação geral de todo o torneio — pontos, vitórias, saldo e gols a favor — e o organizador decide e registra o resultado se o empate persistir. W.O. entra nessa comparação pelo seu placar oficial.

A classificação deve destacar visualmente os classificados fixos de cada grupo e, quando aplicável, os classificados adicionais por posição, com identidade visual distinta para cada faixa.

### 8.4 Mata-mata

O sistema deve gerar chave e confrontos a partir dos jogadores classificados, segundo a regra de sorteio escolhida pelo organizador. Os sorteios de grupos e mata-mata sempre alocam jogadores, nunca equipes ou seleções de jogo. Em mata-mata direto, a primeira rodada é definida por sorteio aleatório e auditável entre os jogadores aprovados, sem cabeças de chave ou alocação manual na V1. A configuração inicial deve suportar oitavas de final, quartas de final, semifinais, disputa de terceiro lugar opcional e final.

Para a primeira fase de mata-mata, quando houver fase de grupos, o organizador pode escolher:

- Aleatório: confrontos definidos por sorteio, independente dos grupos de origem.
- Melhor x Pior [1]: primeiros colocados de cada grupo, reordenados por classificação, enfrentam segundos colocados reordenados de forma inversa. Exige exatamente dois classificados por grupo.
- Melhor x Pior [2]: todos os classificados são ordenados na classificação geral. Primeiro enfrenta último, segundo enfrenta penúltimo, e assim por diante.
- Grupo A x B, C x D e assim por diante: estilo Copa do Mundo, com classificados equivalentes de grupos pareados. Exige exatamente dois classificados por grupo.

Depois de cada rodada eliminatória, o organizador configura se a próxima rodada seguirá a chave existente ou terá novo sorteio entre os classificados daquela rodada.

Em partidas eliminatórias de jogo único empatadas, aplica-se prorrogação seguida de pênaltis, regra fixa da V1. Em confrontos de ida e volta, a Arena Eleggante deve somar os gols das duas partidas e, persistindo empate no agregado, aplica-se prorrogação seguida de pênaltis na segunda partida. A plataforma registra placar regular e vencedor, sem somar placares de pênaltis ao resultado da partida.

## 9. Partidas e resultados

### 9.1 Modos presenciais e online

Todo torneio deve informar se é presencial ou online e qual edição de EA FC será disputada. Na primeira versão, a plataforma é sempre PlayStation. O organizador pode selecionar a edição atual ou anterior do EA FC, como EA FC 27 ou EA FC 26. Além das informações gerais de cada partida, cada torneio define se evidências são exigidas nas sugestões de resultado. A V1 aceita imagens anexadas e links externos para vídeo; o organizador pode registrar o resultado oficial sem evidência. Torneios online podem exigir IDs dos jogadores e instruções de conexão. Torneios presenciais podem registrar local, mesa, console ou observações operacionais.

### 9.2 Envio, aprovação e publicação

1. Após a partida, cada um dos dois jogadores do confronto pode enviar uma sugestão de placar, vencedor quando necessário e evidências solicitadas. Uma partida pode, portanto, ter até duas sugestões independentes.
2. O resultado fica pendente e não altera dados públicos, classificação ou chave.
3. O organizador revisa as sugestões — com indicação visual de concordância ou divergência — e registra o resultado oficial, rejeita uma sugestão com motivo ou abre uma disputa. Nenhuma sugestão é publicada automaticamente.
4. Somente após publicação o resultado passa a atualizar classificação, qualificados e avanço da chave.

O organizador também pode registrar um resultado diretamente, sujeito ao mesmo histórico de auditoria. O resultado oficial sempre depende da ação do organizador. A V1 não impõe prazo sistêmico para sugestões de resultado: elas permanecem disponíveis até a decisão do organizador. Jogadores e visitantes só visualizam resultados publicados.

### 9.3 Disputas, W.O. e correções

Enquanto o torneio estiver Em andamento, o organizador deve poder abrir e encerrar uma disputa, anexar justificativa e definir a resolução: aprovar um envio, ajustar resultado, declarar W.O., anular ou reagendar a partida. Na V1, W.O. simples registra vitória de 3 × 0, contabilizada como partida, vitória ou derrota e gols a favor e contra. W.O. duplo anula a partida para ambos, sem contabilizar jogo, pontos ou gols.

Antes que a primeira partida de um jogador ocorra — seja uma partida válida ou um W.O. simples — o organizador pode substituir sua participação por outro jogador. A substituição preserva o registro administrativo e transfere a vaga ainda não disputada ao novo jogador. Quando a equipe ou seleção foi sorteada, o substituto herda a escolha já atribuída; quando a escolha cabe ao participante, o substituto pode escolher a equipe ou seleção que quiser. Após a primeira partida ou W.O. simples, o jogador não pode ser substituído: uma desistência é tratada com W.O. nas partidas seguintes, conforme decisão do organizador.

O jogador pode retirar sua própria solicitação enquanto ela estiver pendente ou aprovada, até que o conjunto de participantes seja congelado para o primeiro sorteio. Depois desse marco, somente o organizador pode tratar sua saída como substituição ou desistência.

Ao corrigir resultado já publicado enquanto o torneio estiver Em andamento, o sistema deve mostrar os impactos sobre classificação e confrontos dependentes. Se houver resultado dependente ainda não publicado, ele deve ser invalidado. Se houver resultado dependente publicado, a correção exige confirmação explícita do organizador e deve permanecer integralmente auditada. Após o encerramento, correções são tratadas fora da plataforma na V1.

## 10. Experiência pública

Cada torneio público deve ter uma página própria com:

- Identidade visual Eleggante e informações principais do evento.
- Status, formato, modalidade, plataforma, local ou instruções online.
- Período de inscrições e ação para solicitar participação quando aplicável.
- Participantes aprovados, quando habilitado pela organização, mostrando ao visitante o nome de usuário e identificador da Arena Eleggante do jogador, além da equipe ou seleção escolhida ou sorteada para sua participação. Após anonimização, o nome de usuário é ocultado e permanecem somente o identificador Arena Eleggante e a equipe ou seleção histórica.
- Calendário e próximos confrontos, quando o torneio for de múltiplos dias ou quando horários tiverem sido informados para evento de um dia.
- Resultados publicados.
- Classificação de grupos com destaque para classificados fixos e adicionais.
- Tabela geral da fase de grupos, com os mesmos destaques visuais para classificados fixos e adicionais, permitindo comparar todos os participantes.
- Chave de mata-mata atualizada conforme os resultados publicados.
- Regulamento e informações de desempate, W.O. e disputas.
- Campeão, pódio, melhor e pior ataque, melhor e pior defesa após encerramento. Melhor e pior ataque correspondem, respectivamente, ao maior e menor total de gols a favor; melhor e pior defesa, ao menor e maior total de gols contra. As estatísticas consideram participantes com ao menos uma partida válida ou W.O. simples, usando o placar oficial do W.O. O terceiro colocado só é exibido quando essa posição tiver sido habilitada na configuração. Empates em estatísticas finais exibem todos os jogadores empatados.
- Foto de destaque do torneio, em formato de capa ou perfil ampliado.

As páginas devem ser responsivas, priorizando consulta rápida em celular durante o evento.

## 11. Área administrativa

Organizadores autorizados devem conseguir:

- Criar, editar, submeter para aprovação do Proprietário, publicar, encerrar e arquivar torneios. O Organizador que cria um torneio fica automaticamente atribuído a ele. A submissão para aprovação notifica o Proprietário por e-mail. Após a publicação da final, o sistema sinaliza que o torneio está apto a encerrar, mas o Organizador confirma explicitamente o encerramento.
- Definir modalidade, capacidade, datas, local ou regras online.
- Configurar formato, grupos, classificações, critérios de desempate e chave.
- Abrir e encerrar inscrições.
- Revisar, aprovar e rejeitar participantes.
- Conduzir sorteio aleatório e auditável de equipes ou seleções, grupos e confrontos eliminatórios, sem permitir alocação manual de participantes. O conjunto de participantes elegíveis deve ser congelado antes do sorteio, respeitando as regras específicas de sorteio configuradas para cada fase de mata-mata. Grupos e mata-mata alocam jogadores, enquanto o sorteio de equipes ou seleções segue suas próprias regras de exclusividade.
- Criar um sorteio ao vivo, somente para acompanhamento, com link não listado e público para quem o possuir; o resultado e o momento da execução ficam registrados no histórico.
- Enviar convite ou notificação por e-mail somente aos participantes aprovados e elegíveis para acompanhar o sorteio de equipes, grupos ou mata-mata assim que a fase correspondente ficar apta para sorteio — após o encerramento das inscrições ou da fase de grupos, conforme o caso — e permitir que o Proprietário reenvie a notificação manualmente no momento desejado.

Quando um torneio tiver sorteio de equipes ou seleções e fase de grupos, os sorteios são eventos independentes: primeiro ocorre o sorteio de equipes ou seleções e depois o sorteio de grupos. Cada evento possui seu próprio link ao vivo, registro e notificação.

A Arena Eleggante gera automaticamente a ordem dos confrontos para eventos de um dia e torneios de múltiplos dias. Datas e horários são opcionais e preenchidos ou ajustados pelo Organizador; a V1 não otimiza automaticamente a agenda. Ao retomar um torneio suspenso, o Proprietário deve reagendar manualmente partidas cujos horários tenham passado antes de movê-lo novamente para Em andamento.
- Gerar e ajustar agenda de partidas antes do início.
- Revisar submissões de resultado e evidências.
- Publicar, rejeitar, corrigir, anular, declarar W.O. ou reagendar partidas.
- Consultar histórico de alterações e decisões.

Quando todos os resultados de grupos estiverem publicados e os desempates resolvidos, a Arena Eleggante sinaliza que a fase eliminatória está apta. O Organizador deve executar duas ações explícitas e auditáveis: primeiro encerrar a fase de grupos; depois iniciar o sorteio ou a geração da chave eliminatória. O sorteio nunca começa automaticamente.

Proprietários também devem criar e atribuir organizadores aos torneios da Eleggante.

## 12. Identidade visual

O produto deve aplicar a identidade oficial da Barbershop Eleggante. Antes da implementação de interface, a Eleggante deve fornecer logo, paleta de cores, tipografia, imagens permitidas e regras de uso.

Nenhum logotipo, cor institucional ou elemento de marca deve ser inventado sem aprovação. A estrutura visual deve permitir trocar ativos e configurações de marca no futuro, apoiando a evolução para múltiplas organizações sem alterar regras de torneio.

## 13. Requisitos não funcionais

- Interface pública e administrativa em pt-BR.
- Datas e horários operados e exibidos no fuso `America/Sao_Paulo` em toda a V1.
- Catálogo único, estático e imutável de clubes e seleções, com emblemas de clubes e bandeiras de países, independente da edição de EA FC ou da plataforma. A Arena Eleggante usa o nome oficial da equipe ou seleção, sem reproduzir alterações de licenciamento ou nomenclatura de um jogo. Não há sincronização automática com EA FC ou API externa em execução. A especificação técnica deve definir a fonte e o licenciamento aprovados para esses ativos.
- Experiência responsiva para celular e desktop.
- Controle de acesso por papel, por organização e por atribuição do Organizador ao torneio; o Administrador da Plataforma tem acesso global sujeito às demais restrições deste documento.
- Separação de deveres: decisões administrativas que envolvam a própria participação de qualquer administrador exigem outro administrador autorizado que não participe da decisão.
- Dados publicados separados de rascunhos e submissões pendentes.
- Histórico auditável de eventos administrativos relevantes, visível somente a Administradores da Plataforma, Proprietários e Organizadores atribuídos, somente para adição e sem edição ou remoção. Eventos de auditoria registram referências estáveis, não valores de dados pessoais; visitantes visualizam apenas informações explicitamente publicadas.
- Proteção de dados pessoais: telefone, e-mail, EA ID, PSN ID e evidências são visíveis somente a Administradores da Plataforma, Proprietários e Organizadores atribuídos. Visitantes veem apenas o nome de usuário do jogador e a equipe ou seleção de sua participação. O arquivamento preserva o histórico competitivo. O jogador pode solicitar autenticamente a exclusão ou anonimização de seus dados pessoais; a organização anonimiza telefone, nome, e-mail, nome de usuário, IDs externos e evidências vinculáveis, preservando resultados, identificador da Arena Eleggante, equipe ou seleção histórica e o mínimo de auditoria necessário conforme LGPD. A anonimização desativa a conta de modo irreversível: não há rollback e, se a pessoa retornar, deverá criar uma nova conta e concluir o onboarding novamente.
- E-mails são exclusivamente operacionais — autenticação, decisões de inscrição, aprovação de torneio, sorteios, suspensão e cancelamento — e não dependem de aceite promocional.
- Consentimento versionado dos Termos de Uso e Aviso de Privacidade antes do primeiro acesso autenticado ou inscrição.
- Arquitetura sem dependência de fornecedor de IA ou de integração externa específica.

## 14. Critérios de aceite do PRD

O produto estará pronto para seguir para especificação técnica quando as specs comprovarem os cenários abaixo:

- Criar e operar torneios com capacidade configurável de até 32 participantes e restringir mata-mata direto a chaves de 4, 8 ou 16 participantes, com oitavas de final como maior fase eliminatória da V1.
- Exigir aprovação explícita do Proprietário para que um torneio criado por Organizador possa abrir inscrições ao público.
- Notificar o Proprietário por e-mail quando um Organizador submeter torneio para aprovação.
- Permitir que o Proprietário reprove um novo torneio com justificativa e notificação ao Organizador, impedindo sua edição ou reenvio, mas permitindo aprovação excepcional somente pelo Proprietário.
- Permitir que o Proprietário suspenda um torneio em andamento, bloqueando sua operação, e seja o único a retomá-lo para Em andamento.
- Manter torneio suspenso público em modo somente leitura, com justificativa e notificação por e-mail aos participantes aprovados, e permitir que somente o Proprietário cancele definitivamente um torneio já iniciado, com justificativa, notificação e sem campeão.
- Validar que participantes, grupos, classificados fixos e classificados adicionais formam uma chave de 4, 8 ou 16 participantes antes de liberar o sorteio e o mata-mata.
- Bloquear uma configuração que não resulte em chave eliminatória de 4, 8 ou 16 classificados.
- Configurar se haverá terceiro lugar e, quando houver, definir disputa entre perdedores das semifinais ou classificação por melhor campanha; não exibir terceiro colocado quando a posição não estiver habilitada.
- Classificar corretamente participantes de grupos, incluindo classificados adicionais por qualquer posição elegível.
- Calcular terceiro colocado por melhor campanha entre perdedores das semifinais, quando essa configuração estiver habilitada sem partida, usando pontos, vitórias, saldo, gols a favor e decisão manual auditada em caso de empate persistente.
- Calcular percentual de aproveitamento e aplicar os destaques corretos na tabela de cada grupo e na tabela geral.
- Gerar confrontos por todos os tipos de sorteio definidos e permitir novo sorteio entre rodadas quando configurado.
- Calcular confrontos de ida e volta e aplicar prorrogação seguida de pênaltis na segunda partida quando houver igualdade no agregado.
- Aplicar prorrogação seguida de pênaltis como desempate fixo de mata-mata, sem somar placares de pênaltis ao placar regular.
- Permitir inscrição pública com aprovação manual e sem qualquer fluxo de pagamento.
- Notificar jogador por e-mail sobre aprovação ou rejeição de inscrição e exigir justificativa para rejeição.
- Exigir telefone em toda inscrição e exigir equipe ou seleção quando a modalidade do torneio for escolha do participante, aplicando a regra de tipo de equipe configurada; na modalidade de sorteio, atribuir a equipe ou seleção após a aprovação.
- Oferecer catálogo único, estático e imutável para a escolha e o sorteio de equipes ou seleções, exibindo nome oficial, emblema de clube ou bandeira do país conforme o tipo, sem depender da edição do EA FC.
- Criar perfil com nome de usuário único e identificador público sequencial e imutável da Arena Eleggante no formato `AE-000123`, exibindo ambos ao visitante junto da equipe ou seleção da participação, sem expor dados de contato ou IDs externos.
- Unificar login por Google e código único no mesmo usuário quando ambos comprovarem o mesmo e-mail verificado, sem permitir contas duplicadas para esse e-mail.
- Sortear equipes ou seleções quando essa modalidade estiver ativa, sem repetição e com opções suficientes para todos os participantes, e bloquear alocação manual em grupos e mata-mata, que sempre sorteiam jogadores.
- Permitir ou bloquear, por configuração do torneio, a alteração de equipe ou seleção pelo jogador durante a competição, preservando o histórico de cada partida.
- Manter solicitações excedentes como lista de espera pendente, ordenada pela data de inscrição e promovida apenas por escolha manual do organizador, quando a capacidade de participantes aprovados for atingida.
- Permitir que jogador retire sua própria inscrição até o congelamento do conjunto elegível para o primeiro sorteio e, após esse marco, restringir a saída a substituição ou desistência gerida pelo organizador.
- Permitir login por e-mail OTP e Google.
- Permitir uma sugestão de resultado por cada responsável de uma partida, até duas sugestões por confronto, e indicar visualmente sua concordância ou divergência ao organizador.
- Não impor prazo sistêmico para sugestões de resultado antes da decisão do organizador.
- Exigir evidências por configuração do torneio, aceitando imagem ou link externo para vídeo, sem impedir o organizador de registrar o resultado oficial diretamente.
- Exigir que o organizador registre o resultado oficial antes de refletir resultado em páginas públicas, tabela ou chave.
- Registrar, resolver e auditar uma disputa, W.O. e correção de resultado.
- Bloquear qualquer alteração de resultados, pódio ou estatísticas depois que o torneio estiver Encerrado.
- Aplicar W.O. simples como vitória de 3 × 0 com efeitos completos na classificação e W.O. duplo como partida anulada para ambos, sem efeitos estatísticos ou de pontos.
- Permitir a substituição de um jogador somente antes de sua primeira partida válida ou W.O. simples e, depois disso, tratar desistência com W.O. nas partidas seguintes.
- Manter a equipe ou seleção sorteada quando houver substituição e permitir que o substituto escolha livremente sua equipe ou seleção quando essa escolha couber ao participante.
- Exibir torneio aberto ou em andamento ao público em celular e desktop e manter torneio arquivado acessível por URL direta, em modo somente leitura, fora das listagens públicas padrão.
- Exigir encerramento explícito pelo Organizador após a publicação da final e exibir todos os empatados em estatísticas finais.
- Calcular ataque por gols a favor e defesa por gols contra, incluindo somente jogadores com partida válida ou W.O. simples e aplicando o placar oficial do W.O.
- Adaptar calendário e exibição de horários para eventos de um dia e torneios de múltiplos dias.
- Gerar a ordem dos confrontos sem otimização automática de agenda e exigir reagendamento manual pelo Proprietário de partidas afetadas antes de retomar torneio suspenso.
- Permitir acompanhamento público de sorteio ao vivo, somente leitura, por link não listado, mantendo o conjunto elegível congelado e o evento auditado, e enviar o convite por e-mail somente aos participantes aprovados e elegíveis quando a fase ficar apta para sorteio.
- Gerar a primeira rodada de mata-mata direto por sorteio aleatório e auditável, sem cabeças de chave ou alocação manual.
- Exigir ações distintas e auditáveis para encerrar a fase de grupos e para iniciar o sorteio ou a geração da chave eliminatória.
- Permitir que o Administrador da Plataforma opere organizações e torneios globalmente e cadastre o primeiro Proprietário, sem contornar regras de estado, auditoria, separação de deveres ou imutabilidade após Encerrado.
- Permitir vários Proprietários na mesma organização e que um Proprietário adicione outros Proprietários.
- Restringir funções administrativas a Administradores da Plataforma, Proprietários e Organizadores atribuídos.
- Restringir histórico completo de auditoria a Administradores da Plataforma, Proprietários e Organizadores atribuídos, expondo ao público apenas informações publicadas.
- Manter auditoria somente para adição, sem edição ou remoção de eventos, inclusive após anonimização.
- Impedir que qualquer administrador decida sobre sua própria inscrição ou partida e exigir outro administrador autorizado nesses casos.
- Registrar a versão, data e horário do aceite de Termos de Uso e Aviso de Privacidade no primeiro acesso autenticado ou antes da inscrição.
- Exigir novo aceite quando uma versão dos Termos de Uso ou Aviso de Privacidade for atualizada, antes do próximo acesso autenticado ou inscrição, sem encerrar sessões em andamento.
- Permitir solicitação autenticada de anonimização de telefone, nome, e-mail, nome de usuário, IDs externos e evidências vinculáveis, preservando resultados, identificador Arena Eleggante, equipe ou seleção histórica e auditoria mínima necessária.
- Desativar irreversivelmente a conta anonimizada, sem rollback, e exigir novo onboarding para qualquer retorno futuro.
- Enviar apenas e-mails operacionais na V1, sem comunicação de marketing.

## 15. Próximo documento

Após aprovação deste PRD, criar uma especificação técnica separada em pt-BR. Ela definirá modelo de dados, máquina de estados, regras de autorização, algoritmo de geração de grupos e chaves, contratos de API, estados de interface, estratégia de auditoria e cenários de teste.
