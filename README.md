# Mais Digital — Site profissional

Projeto organizado com frontend e backend básico.

## Estrutura

```txt
mais-digital-pro/
├── frontend/
│   ├── index.html
│   └── assets/
│       ├── css/styles.css
│       └── js/main.js
├── backend/
│   ├── server.js
│   └── data/leads.jsonl
├── package.json
└── README.md
```

## Rodar localmente

1. Instale o Node.js.
2. Abra a pasta do projeto no terminal.
3. Execute:

```bash
npm install
npm start
```

4. Acesse:

```txt
http://localhost:3000
```

## O que já vem pronto

- Landing page profissional e responsiva.
- Animações de entrada ao rolar a página.
- Menu mobile.
- Hero com painel visual animado.
- Cards de serviços e planos.
- Plano customizado centralizado.
- Formulário preparado para backend.
- Backend Express com rota `/api/leads`.
- Salvamento de leads em `backend/data/leads.jsonl`.

## Próximos ajustes necessários

- Trocar `55XXXXXXXXXXX` pelo WhatsApp real.
- Trocar `contato@maisdigital.com` pelo e-mail real.
- Definir links reais de Instagram e pagamento.
- Integrar gateway de pagamento, como Asaas ou Mercado Pago, quando necessário.
