# Leitura Bíblica — 6 Meses 📖

App de plano de leitura bíblica comunitário da **Igreja Batista Jardim Primavera (IBJP)**, Guarujá/SP.

Permite acompanhar a leitura da Bíblia completa em 6 meses, com progresso individual sincronizado entre dispositivos, meditações publicadas pelo pastor e comentários da comunidade.

---

## Páginas

| Arquivo | URL | Descrição |
|---|---|---|
| `index.html` | `/` | App principal de leitura — plano dia a dia, streak, heatmap, anotações |
| `meditacoes.html` | `/meditacoes.html` | Meditações da comunidade — leitura, curtidas e comentários |
| `admin.html` | `/admin.html` | Área restrita — publicar e moderar meditações |

## Estrutura do plano

- **144 dias úteis** (segunda a sábado, 6 meses)
- **~8 capítulos/dia** — AT + NT intercalados + 1 Salmo devocional
- **Bíblia completa**: todos os 66 livros, 1.189 capítulos
- Links diretos para cada capítulo no [Bible.com (NVI)](https://www.bible.com/pt)

### Distribuição por mês

| Mês | AT | NT | Salmos |
|---|---|---|---|
| 1 | Gênesis · Êxodo · Levítico | Mateus · Marcos | Sl 1–25 |
| 2 | Números · Deuteronômio · Jó | Lucas · João | Sl 26–50 |
| 3 | Josué · Juízes · Rute · 1Sm · 2Sm · 1Cr | Atos · Romanos · 1Co | Sl 51–75 |
| 4 | 1Rs · 2Rs · 2Cr · Esdras · Neemias · Ester · Pv · Ec · Ct | 2Co–2Ts | Sl 76–100 |
| 5 | Isaías · Jeremias · Lm · Ezequiel · Daniel | 1Tm–2Pe | Sl 101–125 |
| 6 | Profetas menores (12) | 1Jo–Ap | Sl 126–150 |

---

## Tecnologia

- **Frontend**: HTML/CSS/JS puro — sem frameworks, sem build step
- **Backend**: Google Apps Script (serverless, gratuito)
- **Banco de dados**: Google Sheets (abas por usuário)
- **Hospedagem**: GitHub Pages (gratuito)

### Por que essa stack?

Escolha deliberada para a Fase 1: zero custo, zero infraestrutura, zero manutenção de servidor. A limitação principal é latência (~1–2s por operação no Sheets) e concorrência limitada. A Fase 3 migra para Node.js + PostgreSQL quando houver adesão suficiente.

---

## Backend — Google Apps Script

O arquivo `backend-apps-script.gs` é o código do servidor. Ele roda vinculado a uma planilha Google e é publicado como Web App.

### Abas da planilha

| Aba | Conteúdo |
|---|---|
| `usuarios` | Índice de todos os usuários cadastrados |
| `<nome>` | Uma aba por usuário com os 144 dias (progresso + anotações) |
| `admins` | Usuários com acesso ao painel admin |
| `meditacoes` | Meditações publicadas |
| `comentarios` | Comentários nas meditações |
| `curtidas` | Registro de curtidas por usuário |

### Rotas da API

**Públicas (sem autenticação):**
```
?action=get_meditacoes&dia=N        → meditações de um dia
?action=get_todas_med               → todas as meditações ativas
?action=curtir&med_id=X&nome=Y      → curtir/descurtir
?action=get_comentarios&med_id=X    → comentários de uma meditação
?action=comentar&med_id=X&nome=Y&texto=Z → comentar
```

**Usuário (requer nome):**
```
?action=get&nome=X                  → progresso + notas do usuário
?action=toggle&nome=X&dia=N         → marcar/desmarcar dia
?action=salvar_nota&nome=X&dia=N&tags=...&nota=... → salvar anotação
```

**Admin (requer usuario + senha):**
```
?action=login_admin&usuario=X&senha=Y
?action=publicar&...
?action=editar_med&med_id=X&...
?action=moderar_med&med_id=X&ativa=true/false
?action=moderar_com&com_id=X&ativa=false
?action=criar_admin&...
?action=listar_admins&...
?action=remover_admin&alvo=X
?action=trocar_senha&nova_senha=X
```

### Níveis de acesso admin

| Role | Publicar | Moderar | Gerenciar usuários |
|---|---|---|---|
| `colaborador` | ✅ | ❌ | ❌ |
| `pastor` | ✅ | ✅ | ❌ |
| `superadmin` | ✅ | ✅ | ✅ |

---

## Como configurar do zero

### 1. Google Sheets + Apps Script

1. Crie uma planilha em [sheets.google.com](https://sheets.google.com) — nome sugerido: **"Plano Leitura Bíblica"**
2. Na planilha: **Extensões → Apps Script**
3. Apague o código padrão e cole o conteúdo de `backend-apps-script.gs`
4. Salve (Ctrl+S) — nomeie o projeto como "Plano Bíblico"
5. **Implantar → Nova implantação → App da Web**
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
6. Copie a URL gerada (começa com `https://script.google.com/macros/s/...`)

### 2. Configurar a URL nos HTMLs

Nos três arquivos HTML, localize e substitua:
```
const SCRIPT = "https://script.google.com/macros/s/SEU_ID/exec";
```

### 3. GitHub Pages

1. Faça upload dos arquivos para este repositório
2. **Settings → Pages → Branch: main → Save**
3. Em ~2 minutos o site estará disponível em `https://brunonunesz.github.io/leitura-biblica/`

### 4. Primeiro acesso ao admin

- URL: `/admin.html`
- Usuário padrão: `bruno`
- Senha padrão: `ibjp2025`
- **Troque a senha imediatamente** em "Minha conta" após o primeiro acesso

---

## Features

### App de leitura (`index.html`)
- 🔥 Streak de dias consecutivos com recorde pessoal
- 🗺️ Heatmap visual dos 144 dias
- 📅 Previsão de conclusão baseada no ritmo atual
- 🏆 Conquistas desbloqueáveis (7 dias, 30 dias, mês completo, etc.)
- 📖 Versículo do dia de cada leitura
- 🔗 Conexões AT↔NT em dias específicos
- 📚 Contexto histórico de cada livro bíblico
- ✏️ Anotações por dia com marcadores (Orei, Destaquei, Dúvida, EBD)
- 👥 Ranking do grupo (quando há 2+ usuários)
- 🔄 Sincronização automática entre dispositivos

### Meditações (`meditacoes.html`)
- Leitura de meditações por dia do plano
- Filtro por tipo: Pastoral, Exegese, Devocional, EBD, Testemunho
- Curtidas e comentários com nome do leitor
- Navegação rápida por dia

### Admin (`admin.html`)
- Publicar meditações vinculadas a dias específicos
- Editar meditações publicadas
- Moderar meditações (visível/oculto)
- Moderar comentários (remover)
- Gerenciar usuários admin (superadmin)
- Trocar senha individual

---

## Roadmap

- [x] **Fase 1** — Apps Script + Google Sheets + GitHub Pages
- [x] **Fase 2** — Meditações comunitárias, curtidas e comentários
- [ ] **Fase 3** — Migração para servidor próprio (Node.js + PostgreSQL) com autenticação OAuth, notificações push e suporte multi-igreja

---

## Segurança

Por design, este projeto usa Google Sheets como banco de dados com uma API pública (Apps Script). Isso significa que a URL da API é visível no código-fonte. As proteções implementadas são:

- Autenticação admin por usuário/senha individual
- Roles diferenciados (superadmin, pastor, colaborador)
- Operações de escrita nas rotas de progresso exigem o nome correto

Para dados sensíveis ou escala maior, a Fase 3 resolve com autenticação real e API privada.

---

## Licença

Projeto de uso interno da IBJP. Código disponível para outras igrejas que queiram adaptar.

---

*Desenvolvido com ❤️ para a Igreja Batista Jardim Primavera — Guarujá/SP*
