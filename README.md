# ☕ Café Store — Loja de grãos de café (projeto de demonstração)

Sistema completo (back-end + front-end estático) simulando uma loja de grãos
de café: cadastro/login com recuperação de senha, catálogo, compras com
controle de estoque, e acompanhamento de vendas/entregas. Construído como
material de estudo/demonstração de **boas práticas de segurança (OWASP)** em
uma aplicação Node.js + Express + PostgreSQL.

> ⚠️ **Todos os dados (usuários, CPFs, senhas, endereços) são 100% fictícios**,
> gerados apenas para popular o banco de exemplo. Não é um sistema para uso em
> produção sem revisão adicional (ver seção "Limitações" no final).

---

## Como rodar

Pré-requisitos: Node.js 18+ e um PostgreSQL (12+) acessível.

### 1. Suba um PostgreSQL

**Opção A — Docker (mais simples):**
```bash
docker compose up -d
```
Isso cria um Postgres local na porta `5432`, com banco `cafestore` e usuário
`cafestore_app` (senha `troque_esta_senha`, já usada nos exemplos abaixo).

**Opção B — PostgreSQL já instalado na máquina:**
```sql
CREATE DATABASE cafestore;
CREATE ROLE cafestore_app LOGIN PASSWORD 'troque_esta_senha';
GRANT ALL PRIVILEGES ON SCHEMA public TO cafestore_app;
ALTER DATABASE cafestore OWNER TO cafestore_app;
```
> Por princípio de menor privilégio, a aplicação roda com uma role dedicada
> (`cafestore_app`), nunca com o superusuário `postgres`.

### 2. Configure e suba a aplicação

```bash
npm install
cp .env.example .env     # depois edite o .env com segredos fortes (veja instruções dentro do arquivo)
npm start                # sobe o servidor em http://localhost:3000
```

Na primeira execução, o servidor cria automaticamente todas as tabelas
(`CREATE TABLE IF NOT EXISTS`) e popula o banco com dados fictícios (3
usuários e 5 produtos) caso a tabela `users` esteja vazia. Abra
`http://localhost:3000` no navegador.

> Se preferir, use provedores gerenciados (Render, Supabase, Neon, RDS...):
> basta apontar `DATABASE_URL` no `.env` para a connection string fornecida
> por eles e, se exigirem TLS, definir `PGSSLMODE=require`.

### Contas fictícias para teste

| Papel     | E-mail                        | Senha              |
|-----------|--------------------------------|---------------------|
| Admin     | admin@cafestore.test           | Admin@Cafe123!      |
| Cliente   | maria.silva@exemplo.test       | CafeComLeite@2024   |
| Cliente   | joao.pereira@exemplo.test      | ExpressoForte#7     |

O fluxo de **recuperação de senha** não envia e-mail real: o link de reset é
impresso no console/terminal onde o `npm start` está rodando (veja
`src/utils/mailer.js`).

---

## Funcionalidades

- **Catálogo** de grãos de café (nome, origem, torra, peso, preço, estoque).
- **Cadastro e login** de clientes, com senha com política mínima de força.
- **Recuperação de senha** por token de uso único e com expiração (15 min).
- **Compra** com carrinho, checkout com endereço de entrega, débito de
  estoque em transação atômica.
- **Cancelamento** de pedido pelo cliente (enquanto ainda não foi enviado),
  com devolução automática ao estoque.
- **Painel administrativo**: cadastro/desativação de produtos e avanço do
  status do pedido (`pendente → pago → em_separação → enviado → entregue`),
  incluindo código de rastreio.
- **Auditoria**: eventos sensíveis (login, falhas de login, reset de senha,
  mudança de status de pedido) ficam registrados na tabela `audit_log`.

---

## Estrutura do projeto

```
cafe-store/
├── server.js                  # bootstrap do Express + middlewares de segurança
├── src/
│   ├── config/
│   │   ├── env.js              # carregamento e validação de variáveis de ambiente
│   │   └── db.js               # pool de conexões PostgreSQL, schema + seed, helper de transação
│   ├── utils/
│   │   ├── crypto.js           # criptografia AES-256-GCM, hashing de tokens
│   │   ├── logger.js           # auditoria com redação de campos sensíveis
│   │   ├── mailer.js           # "envio" simulado de e-mail de reset
│   │   └── asyncHandler.js     # encaminha erros de rotas assíncronas ao error handler
│   ├── middleware/
│   │   ├── auth.js             # JWT, RBAC (requireRole), CSRF
│   │   ├── rateLimiters.js      # limites de taxa por rota sensível
│   │   ├── validateRequest.js   # tratamento centralizado de erros de validação
│   │   └── errorHandler.js      # handler de erro que não vaza detalhes internos
│   ├── controllers/            # regra de negócio (auth, produtos, pedidos)
│   └── routes/                 # definição das rotas + validação de entrada
└── public/                     # front-end estático (HTML/CSS/JS puro)
```

---

## Banco de dados: PostgreSQL

O projeto usa **PostgreSQL** via [`pg`](https://node-postgres.com/) (node-postgres),
com um `Pool` de conexões (`src/config/db.js`) compartilhado por toda a
aplicação. Alguns pontos de atenção específicos da migração de um banco de
arquivo único (como SQLite) para um banco cliente-servidor com concorrência
real:

- **Transações explícitas**: o helper `withTransaction(fn)` abre um `client`
  dedicado do pool, executa `BEGIN`, roda a função recebida e faz
  `COMMIT`/`ROLLBACK` conforme o resultado — usado em qualquer operação que
  precise de múltiplas escritas atômicas (criar pedido, resetar senha,
  seed inicial).
- **Proteção contra condição de corrida no estoque**: ao criar um pedido, o
  produto é lido com `SELECT ... FOR UPDATE` dentro da transação. Isso trava
  a linha até o fim da transação, impedindo que duas compras simultâneas do
  mesmo produto leiam o mesmo estoque "desatualizado" e vendam mais unidades
  do que existem — um cuidado que não era necessário no SQLite de arquivo
  único (que serializa escritas), mas é essencial em um banco que aceita
  conexões verdadeiramente concorrentes.
- **Tipos nativos**: `BOOLEAN` para `active` (em vez de `0`/`1`), `TIMESTAMPTZ`
  para todas as datas (comparações de expiração feitas diretamente pelo
  Postgres, sem depender de strings ISO), e `JSONB` para a coluna `details`
  da tabela de auditoria (permite inclusive consultar o conteúdo com
  operadores JSON do Postgres, se necessário).
- Toda a camada de controllers é **assíncrona** (`async/await`), já que o
  `pg` não é uma API síncrona; erros são encaminhados ao error handler
  central via `asyncHandler` (ou automaticamente pelo Express 5).

## Modelagem de dados (dados fictícios sensíveis)

Tabela `users`: nome, e-mail, **hash bcrypt da senha** (nunca a senha em
texto puro), **CPF criptografado em repouso (AES-256-GCM)** com apenas os 2
últimos dígitos guardados separadamente para exibição mascarada
(`***.***.***-25`), telefone e endereço.

Tabela `password_reset_tokens`: guarda somente o **hash SHA-256** do token de
reset, nunca o token em texto puro — mesmo um vazamento do banco não permite
reutilizar um link de recuperação.

Tabelas `products`, `orders`, `order_items`: catálogo, pedidos e itens do
pedido, com histórico de status de entrega e valores em centavos (evita
problemas de arredondamento de ponto flutuante).

Tabela `audit_log`: trilha de eventos de segurança, com qualquer campo
sensível (senha, token, cpf) automaticamente removido antes de gravar.

---

## Segurança aplicada (mapeamento com OWASP Top 10 2021)

| Categoria OWASP | O que foi aplicado |
|---|---|
| **A01 – Broken Access Control** | RBAC (`requireRole('admin')`), checagem de posse (*ownership*) em pedidos (cliente só vê/cancela os próprios; admin vê todos), uso de `public_id` (UUID) em vez do ID incremental do banco para evitar enumeração de recursos (IDOR). |
| **A02 – Cryptographic Failures** | Senhas com **bcrypt (custo 12)**; CPF criptografado em repouso com **AES-256-GCM**; tokens de reset armazenados apenas como **hash SHA-256**; cookies de sessão `httpOnly` + `Secure` (em produção) + `SameSite=Lax`. |
| **A03 – Injection** | 100% das consultas usam **queries parametrizadas** (`$1, $2...` via `pg`), sem concatenação de SQL; toda entrada do usuário passa por `express-validator` (tipos, tamanhos, formatos, `escape()` contra XSS). |
| **A04 – Insecure Design** | Fluxo de reset de senha com token de uso único e expiração curta; **bloqueio de conta** após 5 tentativas de login incorretas (15 min); mensagens de erro genéricas em login/reset para não revelar quais e-mails existem (anti-enumeração de usuários); `SELECT ... FOR UPDATE` para evitar venda além do estoque sob concorrência. |
| **A05 – Security Misconfiguration** | `helmet` com CSP restritiva, `X-Powered-By` removido, variáveis de ambiente validadas na subida (falha rápido se segredo fraco/ausente), handler de erro que nunca expõe stack trace ao cliente. |
| **A06 – Vulnerable and Outdated Components** | Dependências atuais no momento da criação; recomenda-se rodar `npm audit` periodicamente. |
| **A07 – Identification and Authentication Failures** | JWT de curta duração (30 min), rate limiting dedicado em `/login`, `/register` e `/forgot-password`, política de senha (mínimo 10 caracteres, maiúscula/minúscula/número), comparação de senha em tempo constante via bcrypt, mitigação de *timing attack* na checagem de e-mail inexistente. |
| **A08 – Software and Data Integrity Failures** | Validação estrita de payloads (`express-validator`), transações atômicas (`db.transaction`) para evitar estados inconsistentes de estoque/pedido. |
| **A09 – Security Logging and Monitoring Failures** | Tabela `audit_log` para eventos de autenticação e de pedidos, com redação automática de dados sensíveis antes de logar. |
| **A10 – Server-Side Request Forgery (SSRF)** | Não há chamadas a URLs fornecidas pelo usuário nesta aplicação; ponto documentado caso o sistema evolua para buscar imagens/links externos. |

### Outras proteções implementadas

- **CSRF**: padrão *double-submit cookie* — o cliente precisa reenviar, num
  header (`X-CSRF-Token`), o mesmo valor recebido em um cookie legível por
  JS; requisições que alteram estado (`POST`/`PUT`/`PATCH`/`DELETE`) exigem
  esse header (middleware `requireCsrf`).
- **CORS** restrito a uma origem configurável (`CORS_ORIGIN`), com
  `credentials: true` apenas para essa origem.
- Limite de tamanho do corpo da requisição (`express.json({ limit: '100kb' })`)
  para mitigar negação de serviço por payloads grandes.
- *Soft delete* de produtos (campo `active`) em vez de exclusão física, para
  preservar a integridade do histórico de pedidos antigos.

---

## Limitações conhecidas (o que faltaria para produção real)

- Servir a aplicação atrás de **HTTPS/TLS** (ex.: proxy reverso Nginx +
  Let's Encrypt) e então ativar `COOKIE_SECURE=true`.
- Trocar o "envio de e-mail" simulado por um provedor real (SES, SendGrid…).
- Adicionar autenticação multifator (MFA/2FA) para contas administrativas.
- Adotar uma ferramenta de migrações versionadas (ex.: `node-pg-migrate`,
  `knex` ou `Prisma Migrate`) em vez do `CREATE TABLE IF NOT EXISTS` usado
  aqui, que é suficiente para este projeto de demonstração mas não substitui
  um histórico de migrações em produção.
- Adicionar testes automatizados (unitários e de integração) e pipeline de
  CI com `npm audit` / SCA (Software Composition Analysis).
- Rotacionar `JWT_SECRET`/`FIELD_ENCRYPTION_KEY` via um cofre de segredos
  (Vault, AWS Secrets Manager etc.) em vez de arquivo `.env`.
