# Quizuu · Especificação

## Papéis
- **Organizador (host):** cria quizzes, abre salas, controla o ritmo e projeta a tela principal. Tem login.
- **Jogador:** entra pelo celular com PIN + apelido, sem cadastro.
- **Admin:** gerencia usuários, planos e moderação (fase posterior).

## Criação de quiz
- Título, descrição, capa, tags, visibilidade (privado/público).
- Tipos de pergunta: múltipla escolha (2 a 4), verdadeiro/falso; depois resposta digitada, ordenar e enquete.
- Por pergunta: tempo limite (5 a 120 s), pontos (normal, dobro, zero), imagem.
- Geração por IA a partir de tema ou texto colado.

## Sala ao vivo
- PIN de 6 dígitos e QR code.
- Lobby com presença em tempo real; host pode remover jogador.
- Apelido único por sala, filtro de palavrões.
- Reconexão por token guardado no celular.

## Fluxo da partida
1. Host abre a pergunta (servidor grava `question_started_at`).
2. Celulares mostram só os botões (cor + forma).
3. Fim do tempo ou todos responderam: revela a correta.
4. Distribuição das respostas, ranking parcial, posição pessoal no celular.
5. Pódio final.

## Pontuação
`pontos = round(base × (1 − (tempo_ms / limite_ms) / 2))`, com base 1000 × multiplicador.
Acerto imediato = 1000, último segundo = 500, erro = 0.
Bônus de sequência: +100 por acerto seguido a partir do segundo, teto +500.
Desempate: menor tempo total nas respostas corretas.
Tempo medido no servidor (chegada da resposta menos abertura da pergunta).

## Requisitos não funcionais
- Evento chega ao celular em menos de 300 ms.
- 200 jogadores por sala no MVP.
- Funciona em 4G fraco e navegadores antigos de celular.
- LGPD: jogador anônimo; dados de partida apagáveis.
- Acessibilidade: cor sempre acompanhada de forma; fonte grande.

## Decisões tomadas
- Público principal: eventos e escolas.
- Ferramenta gratuita no primeiro momento.
- Sem envio de imagem ou vídeo por enquanto.
- Login do organizador com e-mail e senha, sem verificação.
- Identidade: design system em docs/design-system (vermelho, laranja, amarelo e roxo, cada cor com sua forma).

## Decisões em aberto
- Domínio.
