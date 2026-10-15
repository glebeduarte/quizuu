# Quizuu

Quiz ao vivo para eventos e escolas. Alegre, rápido de entender e legível de longe.

## Para quem e onde
O Quizuu vive em dois lugares ao mesmo tempo: o **telão** (projetor de auditório, TV de sala de aula) e o **celular** de cada jogador. Tudo é desenhado para funcionar a 10 metros de distância e com o polegar, muitas vezes em projetor com pouco contraste e em celular antigo.

## Voz
- Frases curtas, no presente, falando com o jogador: "Você acertou!", "Faltam 5 segundos".
- Celebrar sem exagero. Um ponto de exclamação por mensagem, no máximo.
- Termos simples: PIN, sala, partida, ranking, pódio. Nada de "sessão" ou "instância" na interface.
- Números com o formato brasileiro: 4.820 pontos, 1,2 s.

## Cores
Quatro cores de resposta formam a identidade. Elas não são decoração: cada uma corresponde a uma posição de resposta e vem sempre com sua forma.

| Posição | Cor | Forma | Texto por cima |
| --- | --- | --- | --- |
| 1 | `answer-red` | triângulo | `on-color` |
| 2 | `answer-orange` | losango | `on-color` |
| 3 | `answer-yellow` | círculo | escuro (#22103a) |
| 4 | `answer-purple` | quadrado | `on-color` |

- **`brand`** é o laranja: botão principal, foco, links.
- **`stage`** é o roxo profundo do telão e da tela do jogador durante a partida. É o "palco": tudo que é jogo acontece sobre ele.
- **`surface`** é o fundo claro das telas de gestão (painel e editor), onde o organizador trabalha com calma.
- **`correct`** e **`wrong`** aparecem só na revelação e sempre com ícone (check ou X).
- Nunca use as cores de resposta para outros significados (por exemplo, vermelho como erro). Erro tem a cor `wrong`.

## Tipografia
- **Baloo 2** (display): títulos, PIN, enunciado, respostas, números. Arredondada e pesada, lê bem projetada.
- **Nunito** (texto): corpo, campos, legendas.
- No telão, o enunciado usa o estilo `question` (44px) e não passa de 120 caracteres. O PIN usa `pin` (64px) em dois grupos de 3 dígitos.
- Números que mudam (pontos, tempo) usam algarismos tabulares para não tremer.

## Forma e profundidade
- Cantos arredondados: `radius-md` (14px) para botões e cartões, `radius-lg` para painéis do telão, `radius-pill` para chips.
- A assinatura é a **`shadow-press`**: uma sombra sólida de 6px embaixo de botões e respostas, que some quando a pessoa aperta. Dá a sensação de tecla física.
- Sem gradientes. Cor chapada, sempre.

## Acessibilidade
- Cor nunca é a única pista: cada resposta tem forma, cada estado tem ícone.
- Texto branco sobre vermelho, laranja e roxo apenas em 20px ou mais e em negrito.
- Áreas de toque de no mínimo 48px; no celular, os botões de resposta ocupam a tela toda.
- Animações respeitam a preferência de movimento reduzido.

## Componentes
- **Resposta**: grade 2×2 de cor e forma.
- **Botão**: principal, secundário, leve e o branco do telão.
- **PIN**: cartão branco do lobby.
- **Cronômetro**: anel amarelo que fica vermelho nos últimos 5 segundos.
- **Ranking**: ouro, prata e bronze para o pódio; destaque para "você" no celular.

## Logo
Ainda não há logo. Até existir, o nome é escrito em Baloo 2, peso 800, em `brand` sobre `surface` ou em `on-color` sobre `stage`.
