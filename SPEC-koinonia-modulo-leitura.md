# Spec — Módulo "Plano de Leitura Bíblica" no Koinonia

> Handoff para a sessão **Koinonia Web & App** (`/Users/michellesantos/Documents/devs/ibjp/`).
> Origem: app standalone atual (`leitura-biblica`, HTML/JS + Google Apps Script/Sheets).
> Objetivo: transformar o plano de leitura num **módulo nativo** do Koinonia, reusando login,
> banco (Postgres+RLS) e a infra de notificação que já existem.

## 0. Estratégia (dois mundos)
- **Fase de convivência:** o app atual (Sheets) continua no ar; o módulo novo é construído em paralelo no Koinonia.
- **Teste no Koinonia** com dados reais migrados (cópia **não-destrutiva** do Sheets).
- **Cutover depois:** migração final + Koinonia vira a fonte de verdade; app antigo é aposentado.
- A migração é **read-only sobre o Sheets** (nunca escreve lá) e **idempotente** (re-executável durante a convivência).

## 1. Decisões de arquitetura
1. **Gerador de planos fica no frontend (TypeScript)** — porta do `biblia.js` atual (determinístico). Evita reescrever em Java e manter duas implementações.
2. **O backend guarda o cronograma gerado** (dia → capítulos) junto do plano. Assim o backend calcula "dia concluído" e monta a **notificação do dia** sem rodar o gerador.
3. **Progresso por capítulo, isolado por plano** — cada plano do usuário tem seu próprio conjunto de capítulos lidos (via `plan_id`). Nada de misturar planos.
4. **Multi-tenant obrigatório** — toda tabela leva `church_id` + **RLS** (padrão `V2__rls.sql` / `V5__push_subscription.sql`). Plano oficial passa a ser **por igreja**.
5. **Reuso da notificação** — `NotificationRequestedEvent` + canais existentes (Web Push/VAPID, e-mail). Lembrete diário no molde do `scheduling/ReminderJob`.
6. **Módulo Spring Modulith** `reading/` seguindo o padrão `domain/` + `web/` + `package-info.java @ApplicationModule`.

## 2. ⚠️ Pré-requisito de produto: login de membro
Hoje só **ADMIN/LEADER logam**; MEMBER/VOLUNTEER não têm sessão. Um plano de leitura é de **uso diário e individual por membro** → exige identidade persistente por pessoa.
- **Bloqueio de produto (não técnico):** dar login (mesmo leve) aos membros, ou um identity leve por membro.
- **Para testar já:** começar com contas de LEADER/ADMIN; abrir para membros quando o login existir.
- Decidir isso com o roadmap do Koinonia (encaixa na **Fase 4 — módulos extras**).

---

## 3. Modelo de dados (Postgres) — desenhado para performance

Volumes: até **1.189 linhas de progresso por plano por usuário**; ~80 membros ⇒ ~95k linhas/igreja no pior caso — trivial para Postgres. As escolhas abaixo mantêm as operações quentes (marcar/desmarcar, ranking, "dia concluído", streak) em índices.

> Convenções do projeto: entidades estendem `BaseEntity` (PK UUID via `@UuidGenerator`), datas `timestamptz` ↔ `OffsetDateTime`, **toda tabela nova precisa de `church_id` + RLS**. Ajuste o DDL abaixo ao `BaseEntity` (não defina PK no DDL se o `@UuidGenerator` já cuida).

### Tabelas

```sql
-- Plano escolhido por um usuário (histórico; 1 ativo por vez -> isolamento por plano preservado)
create table reading_plan (
  id          uuid primary key,                 -- via BaseEntity/@UuidGenerator
  church_id   uuid not null references church(id),
  user_id     uuid not null references app_user(id),
  plan_key    varchar(80)  not null,            -- identidade p/ ranking e isolamento
                                                 -- ex.: 'oficial' | 'preset:teens' | 'g:sequencial:progressivo:12'
  nome        varchar(120),                      -- rótulo amigável (ex.: 'Teens e Jovens')
  config      jsonb not null,                    -- {tipo,ordem,modo,meses,capsDia,dias_semana,nome}
  schedule    jsonb not null,                    -- [{dia,refs:['GEN.1',...],label,bloco,verse?}]  (gerado no front)
  total_dias  integer not null,
  total_caps  integer not null,                  -- tamanho do escopo (denominador da %, sem recomputar)
  started_on  date not null default current_date,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index  ix_reading_plan_user   on reading_plan(church_id, user_id);
create index  ix_reading_plan_rank   on reading_plan(church_id, plan_key) where is_active;   -- ranking
create unique index ux_reading_plan_active on reading_plan(user_id) where is_active;         -- 1 ativo/usuário

-- Capítulos lidos — tabela quente. Marcar = INSERT; desmarcar = DELETE.
create table reading_progress (
  church_id    uuid not null references church(id),
  plan_id      uuid not null references reading_plan(id) on delete cascade,
  user_id      uuid not null references app_user(id),
  chapter_ref  varchar(12) not null,            -- 'GEN.1' (USFM.capítulo)
  read_at      timestamptz not null default now(),
  primary key (plan_id, chapter_ref)            -- isolamento + upsert/delete O(log n)
);
create index ix_reading_progress_plan   on reading_progress(plan_id);                 -- count p/ %/ranking
create index ix_reading_progress_streak on reading_progress(plan_id, read_at);        -- datas p/ streak/calendário
-- Se o projeto exigir PK UUID (BaseEntity): use id uuid PK + `unique (plan_id, chapter_ref)`.

-- Anotações por dia do plano
create table reading_note (
  id         uuid primary key,
  church_id  uuid not null references church(id),
  plan_id    uuid not null references reading_plan(id) on delete cascade,
  user_id    uuid not null references app_user(id),
  day_num    integer not null,
  tags       varchar(200),
  texto      text,
  updated_at timestamptz not null default now(),
  unique (plan_id, day_num)
);

-- Preferência de lembrete diário
create table reading_reminder (
  user_id     uuid primary key references app_user(id),
  church_id   uuid not null references church(id),
  enabled     boolean not null default false,
  hour_local  smallint not null default 7,      -- hora local 0-23
  updated_at  timestamptz not null default now()
);

-- (Fase 2) Meditações por trecho bíblico
create table meditation (
  id             uuid primary key,
  church_id      uuid not null references church(id),
  author_user_id uuid not null references app_user(id),
  book           varchar(4)  not null,          -- USFM: 'GEN','1CO'
  cap_ini        integer not null,
  cap_fim        integer not null,
  tipo           varchar(20) not null default 'Devocional',
  titulo         varchar(160) not null,
  texto          text not null,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);
create index ix_meditation_passage on meditation(church_id, book, cap_ini);
-- (opcional) meditation_comment, meditation_like — trazer só se for portar o social.
```

### RLS (obrigatório em todas as tabelas acima)
Copiar o padrão exato de `V5__push_subscription.sql`. Exemplo:
```sql
alter table reading_plan enable row level security;
create policy reading_plan_tenant on reading_plan
  using (church_id = current_setting('app.current_tenant')::uuid);
-- repetir para reading_progress, reading_note, reading_reminder, meditation
```

### Por que esse desenho é performático
- **Cronograma como `schedule` JSONB** (uma linha por plano) evita uma tabela `reading_plan_day` gigante; o backend carrega o JSON inteiro só quando precisa (dia-concluído / notificação).
- **`reading_progress` PK composta `(plan_id, chapter_ref)`** → marcar/desmarcar e "capítulo lido?" são acessos por índice único; nada de varredura.
- **Ranking** = 1 query agregada por `(church_id, plan_key)` usando `ix_reading_plan_rank` + `ix_reading_progress_plan`:
  ```sql
  select rp.user_id, count(pr.*) as caps, rp.total_caps
  from reading_plan rp
  join reading_progress pr on pr.plan_id = rp.id
  where rp.church_id = current_setting('app.current_tenant')::uuid
    and rp.plan_key  = :planKey
    and rp.is_active
  group by rp.user_id, rp.total_caps
  order by caps desc;
  ```
  Resolve de vez o **N+1** e o **vazamento de anotações** do modelo atual (Sheets).
- **Streak/calendário** = `select distinct (read_at at time zone :tz)::date ...` por `plan_id` (índice `ix_reading_progress_streak`). Guardar timezone da igreja para converter.
- **Marcar dia inteiro / migração** = batch `insert ... on conflict do nothing`.

---

## 4. API do módulo (REST, tenant vindo do JWT)
Prefixo `/reading` (sem versão, como o resto do MVP). Todos exigem auth; `church_id` e `user_id` vêm do token (nunca do cliente).

| Método | Rota | Corpo / Resposta |
|---|---|---|
| `GET` | `/reading/plan` | plano ativo do usuário: `{config, plan_key, total_dias, total_caps, started_on, schedule}` |
| `POST` | `/reading/plan` | cria/troca plano. Body: `{config, plan_key, nome, total_dias, total_caps, schedule}` (o **front gera o schedule**). Desativa o anterior, ativa este. |
| `GET` | `/reading/progress` | `{refs: ['GEN.1', ...]}` do plano ativo (ou `?planId=`) |
| `POST` | `/reading/progress` | `{refs:[...], read:true|false}` — marca/desmarca em lote (upsert/delete) |
| `DELETE` | `/reading/progress` | zera o progresso do plano ativo (recomeçar) |
| `GET` | `/reading/group` | ranking do `plan_key` do usuário, na igreja: `[{userId, nome, caps, pct}]` |
| `GET/PUT` | `/reading/reminder` | `{enabled, hourLocal}` |
| `GET` | `/reading/meditations?book=&cap=` | (Fase 2) meditações que cruzam o trecho |
| `POST/PUT` | `/reading/meditations` | (Fase 2) publicar/editar (LEADER+) |

Serviço público `reading/ReadingPlanService.java` no raiz do módulo (marcar, ranking, próximo dia, etc.).

---

## 5. Gerador (`planGenerator.ts`) — porte do `biblia.js`
Portar 1:1 do arquivo `biblia.js` atual (é JS determinístico). Contrato:
- `BIBLIA` (66 livros: id USFM, nome, nº capítulos, testamento) · `TOTAL_CAPS = 1189`.
- `gerarPlano(config)` → `{config, total_dias, total_caps, plan_key, dias:[{dia, refs:['GEN.1',...], at, nt, salmo, label, bloco, verse?}]}`.
  - Ordens: `sequencial, intercalado, cronologica, nt, evangelhos`. Modos: `duracao (meses)`, `ritmo (capsDia)`, `progressivo`.
  - **Progressivo**: começa ~1 cap/dia e sobe; **capítulos gigantes** (Sl 119, Nm 7, Lc 1, …) ocupam o dia sozinhos (lista `GRANDES` no arquivo atual).
  - `dias_semana` afeta o nº de dias de leitura (domingo livre etc.).
- `plan_key(config)` (o `planoId` atual): `'oficial' | 'preset:'+nome | 'g:'+ordem+':'+modo+':'+(m|c)+valor`.
- `totalCapsPlano(config)` (denominador: Bíblia toda 1189, só NT 260, evangelhos 89).
- URLs do bible.com em **NVT** (versão `1930`): `https://www.bible.com/pt/bible/1930/GEN.1.NVT`.
- **Plano oficial** (os 144 dias curados com versículo/conexão/contexto): mover o array `PLANO` do `index.html` para um **JSON estático** no front (`reading/officialPlan.json`); `construirPlano({tipo:'oficial'})` usa ele. Incluir o `versiculo` de cada dia no `schedule.dias[].verse` (o backend usa no push).

Fluxo: front chama `gerarPlano(config)` → envia `schedule`+totais+`plan_key` no `POST /reading/plan`. Backend só persiste e serve.

---

## 6. Notificação diária (reusa a infra existente)
- Job `@Scheduled` cross-tenant no molde de `scheduling/ReminderJob` (fixa `TenantContext` por igreja).
- Para cada usuário com `reading_reminder.enabled` + plano ativo + inscrição push:
  1. Carrega `reading_plan.schedule` + `reading_progress.chapter_ref` do plano.
  2. Acha o **primeiro dia não 100% lido** (próxima leitura).
  3. Monta `NotificationRequest`: `body = "📖 Sua leitura de hoje: " + dia.label + " — " + dia.verse`, `url = "/leitura"`, `toUserId`.
  4. Publica `NotificationRequestedEvent` (reusa Web Push/e-mail).
- Respeitar `hour_local` (agrupar por hora ou rodar de hora em hora e filtrar). Sem infraestrutura nova.

---

## 7. Frontend (React 19 + TS + Tailwind)
- `frontend/src/api/resources.ts` → objeto **`ReadingPlan`** com os métodos da API (padrão dos outros recursos).
- `frontend/src/pages/ReadingPlanPage.tsx` (named export) + rota **lazy** em `App.tsx`.
- Item de nav em `Layout.tsx buildNav`: `{ to:'/leitura', label:'Leitura', icon:'📖' }` (aparece na barra inferior mobile + sidebar).
- Reconstruir as abas **Hoje / Plano / Grupo / Meditações** (o app atual serve de referência visual):
  - **Hoje**: streak + conquistas + **leitura do dia com chips por capítulo** (marcar em partes) + calendário de atividade (dias lidos).
  - **Plano**: mapa de progresso (dias do plano lidos x não) + lista de dias.
  - **Grupo**: ranking (do endpoint `/reading/group`, já isolado por plano).
  - **Meditações** (Fase 2).
- Push: reusar `frontend/src/push.ts` + `PushButton.tsx` para o "🔔 Ativar lembrete".

---

## 8. Migração Sheets → Postgres (não-destrutiva, idempotente)

**Fonte (Apps Script atual):**
- `GET {SCRIPT}?action=listar_usuarios` → `[{nome_aba, nome}]`
- `GET {SCRIPT}?action=get&nome=X` → `{plano, lidos, notas, legado_dias}`
  - `lidos`: `{"<plan_key>|GEN.1":"ISO", ...}` (chaves compostas = baldes por plano). Chaves **sem `|`** = formato antigo → tratar como o balde do `plano` atual.
  - `notas`: `{"<dia>": {tags:[...], texto}}` · `plano`: config do plano ativo.
- `SCRIPT` = URL do Apps Script (está no topo dos HTML).

**Script de migração** (Node/TS standalone — usa `fetch` + o `planGenerator.ts` + client `pg`):
1. **Mapa `nome` → `app_user`** (CSV/tabela curada). Nomes não são chave confiável e membros podem não ter conta → o script **lista os não-casados** para resolução manual. (Depende do login de membro — §2.)
2. Para cada usuário do Sheets:
   - Agrupar `lidos` por **prefixo** (balde = plano). Cada prefixo distinto = um `reading_plan`.
   - Para cada balde: derivar `config` do prefixo (parser espelho do `plan_key`: `'oficial'`→`{tipo:'oficial'}`; `'preset:Teens e Jovens'`→config Teens; `'g:sequencial:progressivo:12'`→parse). Rodar `gerarPlano(config)` → `schedule`, `total_*`, `plan_key`.
   - `insert reading_plan` (`is_active=true` só no balde igual ao `plano` ativo; os outros `is_active=false` → **histórico preservado**).
   - `insert reading_progress` (chapter_ref = chave após `|`; `read_at` = valor ISO) com `on conflict do nothing`.
   - `insert reading_note` a partir de `notas` (dia → `day_num`, no plano ativo).
3. **Idempotência:** upsert por chave natural — `reading_plan` por `(user_id, plan_key)`; `reading_progress` por `(plan_id, chapter_ref)`; `reading_note` por `(plan_id, day_num)`. Re-executável para **re-sincronizar** durante a convivência.
4. **Dois mundos:** rodar a migração como **snapshot** para o teste; opcionalmente reagendar (ex.: noturno) para puxar novidade do Sheets. **Nunca escreve no Sheets.** ⚠️ Progresso feito *dentro do Koinonia* durante o teste **não volta** pro Sheets (os mundos divergem — esperado). No **cutover**: 1 sync final + Koinonia vira fonte de verdade.
5. **Meditações:** `meditacoes` do Sheets → `meditation` (`livro,cap_ini,cap_fim,autor,tipo,titulo,texto`). Meditações antigas **sem trecho** (livro vazio) → resolver manualmente ou pular (logar).

---

## 9. Ordem de entrega sugerida
1. **Backend base:** migration `V39__reading.sql` (tabelas + RLS) + módulo `reading` (`ReadingPlanService`) + endpoints `plan`/`progress`. `mvn test` (valida fronteiras do Modulith).
2. **Gerador:** `planGenerator.ts` + `officialPlan.json` (porte do `biblia.js`).
3. **Frontend Hoje/Plano:** página + rota + nav + resource; escolher/gerar plano e marcar leitura.
4. **Ranking:** endpoint `/reading/group` + aba Grupo.
5. **Notificação diária:** job + `reading_reminder` + botão "Ativar lembrete".
6. **Migração:** script Sheets→Postgres (rodar snapshot p/ teste).
7. **(Fase 2)** Meditações.

## 10. Riscos / decisões pendentes
- **Login de membro** (§2) — bloqueio de produto para abrir a todos; testar antes com LEADER/ADMIN.
- **Mapa nome→conta** na migração — precisa de curadoria (membros sem conta).
- **Fuso horário** para streak/calendário e hora do lembrete — usar timezone da igreja.
- **PK de `reading_progress`** — composta (recomendado) vs `BaseEntity` UUID + unique; alinhar ao padrão do projeto.
- **Plano oficial por igreja** — cada igreja pode ter seu "plano oficial"; hoje o curado é o da IBJP. Definir se é global ou por tenant.

---

### Anexos úteis (no repo `leitura-biblica`)
- `biblia.js` — gerador + dataset (fonte do `planGenerator.ts`).
- `index.html` — array `PLANO` (plano oficial curado → `officialPlan.json`) e as views de referência (Hoje/Plano/Grupo).
- `backend-apps-script.gs` — formato exato do Sheets (fonte da migração).
