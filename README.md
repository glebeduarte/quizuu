# Quizuu

Quiz ao vivo no estilo Kahoot: o organizador projeta as perguntas, os jogadores entram pelo celular com um PIN e o sistema mede quem acerta e quem responde mais rápido.

## Stack
- Front: React + Vite + TypeScript + Tailwind
- Banco, login e tempo real: Supabase (Postgres, Auth, Realtime, Storage, Edge Functions)
- IA para gerar perguntas: API do Claude, chamada por Edge Function
- Hospedagem: Vercel

## Estrutura
```
docs/                  especificação e decisões
supabase/migrations/   esquema do banco (SQL versionado)
supabase/functions/    lógica sensível (responder, pontuar, avançar pergunta)
src/                   aplicação web (criada na Fase 3)
```

## Regra de ouro
O tempo de resposta e os pontos são calculados no servidor. O celular nunca recebe qual opção é a correta antes da revelação.

Especificação completa em [docs/especificacao.md](docs/especificacao.md).
