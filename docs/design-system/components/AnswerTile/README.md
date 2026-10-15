Botão de resposta da partida, o elemento mais visto do Quizuu.

Cada posição tem cor e forma fixas: 1 vermelho com triângulo, 2 laranja com losango, 3 amarelo com círculo, 4 roxo com quadrado. A forma garante que daltônicos e quem joga num projetor desbotado reconheçam a opção.

- No celular, os botões ocupam a tela toda em grade 2×2 com `space-2` de vão; o texto pode ser omitido, ficando só cor e forma.
- No telão, mostram o texto completo, com `space-6` de vão.
- Ao pressionar, o botão desce 6px e perde a `shadow-press`.
- Na revelação, a correta ganha o selo de check e as demais ficam com 32% de opacidade (`is-dimmed`).
- Amarelo usa texto escuro (#22103a); as outras três usam `on-color`.

Classes: `qz-answer qz-answer--red|orange|yellow|purple`, estados `is-pressed`, `is-dimmed`.
