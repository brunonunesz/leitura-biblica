// ═══════════════════════════════════════════════════════════════════
//  Plano de Leitura Bíblica — Backend (Apps Script) v4
//  Usuários admin com senha individual + roles
// ═══════════════════════════════════════════════════════════════════

// ── Funções auxiliares ───────────────────────────────────────────────

function normalizarNome(nome) {
  return nome.trim()
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .substring(0, 30);
}

function gerarId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
}

function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Aba de admins ────────────────────────────────────────────────────
// Colunas: usuario | senha_hash | nome_exibicao | papel | role | ativo | criado_em
// role: "superadmin" | "pastor" | "colaborador"
//   superadmin  → publica, modera, cria/remove admins
//   pastor      → publica, modera
//   colaborador → só publica (não modera)

function getAdminsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName("admins");
  if (!s) {
    s = ss.insertSheet("admins");
    s.getRange(1,1,1,7).setValues([["usuario","senha","nome_exibicao","papel","role","ativo","criado_em"]]);
    s.setFrozenRows(1);
    s.getRange(1,1,1,7).setFontWeight("bold");
    // Criar superadmin padrão — TROQUE a senha após o primeiro acesso!
    s.appendRow(["bruno","ibjp2025","Pr. Bruno","Pastor — IBJP","superadmin",true,new Date().toISOString()]);
  }
  return s;
}

function autenticar(usuario, senha) {
  if (!usuario || !senha) return null;
  const s    = getAdminsSheet();
  const rows = s.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r[0] === usuario.toLowerCase().trim() &&
        r[1] === senha &&
        (r[5] === true || r[5] === "TRUE" || r[5] === "true")) {
      return {
        usuario: r[0],
        nome:    r[2],
        papel:   r[3],
        role:    r[4],
        row:     i + 1
      };
    }
  }
  return null;
}

function isSuperadmin(admin) { return admin && admin.role === "superadmin"; }
function podeModerar(admin)  { return admin && (admin.role === "superadmin" || admin.role === "pastor"); }
function podePublicar(admin) { return admin !== null; }

// ── Aba de dados do usuário ──────────────────────────────────────────
// Formato campo|valor (uma linha por campo, valor em JSON):
//   plano        → config do plano escolhido (ordem, modo, ritmo, dias da semana…)
//   lidos        → { "GEN.1": "ISO", ... } capítulos lidos (unidade de progresso)
//   notas        → { "<dia>": { tags:[], texto:"" } } anotações por dia do plano
//   legado_dias  → [N,...] dias concluídos no formato antigo (144 dias), a migrar
//                  pelo frontend usando o plano oficial; depois esvaziado.

function getOrCreateUserSheet(nomeRaw) {
  if (!nomeRaw || nomeRaw.trim() === "") throw new Error("Nome não informado");
  const nomeLimpo = normalizarNome(nomeRaw);
  if (nomeLimpo.length < 2) throw new Error("Nome muito curto");
  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(nomeLimpo);
  if (!sheet) {
    sheet = ss.insertSheet(nomeLimpo);
    inicializarUserSheet(sheet);
    registrarUsuario(ss, nomeRaw.trim(), nomeLimpo);
  } else if (sheet.getRange(1,1).getValue() === "dia") {
    migrarUserSheet(sheet); // converte do formato antigo (144 dias)
  }
  return sheet;
}

function inicializarUserSheet(sheet) {
  sheet.clear();
  sheet.getRange(1,1,1,2).setValues([["campo","valor"]]);
  sheet.getRange(2,1,4,2).setValues([
    ["plano",""], ["lidos","{}"], ["notas","{}"], ["legado_dias","[]"]
  ]);
  sheet.setFrozenRows(1);
  sheet.getRange(1,1,1,2).setFontWeight("bold");
  sheet.setColumnWidth(2, 500);
}

function migrarUserSheet(sheet) {
  const rows = sheet.getDataRange().getValues();
  const notas = {}, legado = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i], dia = r[0];
    if (!dia) continue;
    const done = r[1]===true||r[1]==="TRUE"||r[1]==="true";
    if (done) legado.push(Number(dia));
    const tags = r[4]?String(r[4]):"", nota = r[5]?String(r[5]):"";
    if (tags||nota) notas[String(dia)] = { tags: tags?tags.split(",").filter(Boolean):[], texto: nota };
  }
  inicializarUserSheet(sheet);
  setCampo(sheet, "notas", JSON.stringify(notas));
  setCampo(sheet, "legado_dias", JSON.stringify(legado));
}

// helpers campo|valor
function _campoRow(sheet, campo) {
  const col = sheet.getRange(1,1,Math.max(1,sheet.getLastRow()),1).getValues();
  for (let i = 0; i < col.length; i++) if (col[i][0] === campo) return i+1;
  const r = sheet.getLastRow()+1;
  sheet.getRange(r,1).setValue(campo);
  return r;
}
function getCampo(sheet, campo) { return sheet.getRange(_campoRow(sheet,campo),2).getValue(); }
function setCampo(sheet, campo, valor) { sheet.getRange(_campoRow(sheet,campo),2).setValue(valor); }
function getJSON(sheet, campo, fallback) {
  const v = getCampo(sheet, campo);
  if (!v) return fallback;
  try { return JSON.parse(v); } catch(e) { return fallback; }
}

function registrarUsuario(ss, nomeOriginal, nomeAba) {
  let idx = ss.getSheetByName("usuarios");
  if (!idx) {
    idx = ss.insertSheet("usuarios");
    idx.getRange(1,1,1,3).setValues([["nome_aba","nome_original","data_entrada"]]);
    idx.setFrozenRows(1); idx.getRange(1,1,1,3).setFontWeight("bold");
  }
  const dados = idx.getDataRange().getValues();
  for (let i = 1; i < dados.length; i++) if (dados[i][0] === nomeAba) return;
  idx.appendRow([nomeAba, nomeOriginal, new Date().toISOString()]);
}

function getMeditacoesSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName("meditacoes");
  if (!s) {
    s = ss.insertSheet("meditacoes");
    s.getRange(1,1,1,13).setValues([["id","dia","autor","papel","tipo","titulo","texto","data","curtidas","ativa","livro","cap_ini","cap_fim"]]);
    s.setFrozenRows(1); s.getRange(1,1,1,13).setFontWeight("bold"); s.setColumnWidth(7,400);
  } else if (!s.getRange(1,11).getValue()) {
    // migra planilha existente: adiciona colunas de trecho bíblico
    s.getRange(1,11,1,3).setValues([["livro","cap_ini","cap_fim"]]);
    s.getRange(1,11,1,3).setFontWeight("bold");
  }
  return s;
}

function getComentariosSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName("comentarios");
  if (!s) {
    s = ss.insertSheet("comentarios");
    s.getRange(1,1,1,6).setValues([["id","med_id","autor","texto","data","ativa"]]);
    s.setFrozenRows(1); s.getRange(1,1,1,6).setFontWeight("bold"); s.setColumnWidth(4,400);
  }
  return s;
}

function getCurtidasSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName("curtidas");
  if (!s) {
    s = ss.insertSheet("curtidas");
    s.getRange(1,1,1,3).setValues([["med_id","usuario","data"]]);
    s.setFrozenRows(1); s.getRange(1,1,1,3).setFontWeight("bold");
  }
  return s;
}

// ── Roteador ─────────────────────────────────────────────────────────

function doGet(e) {
  const action  = (e.parameter.action || "get").toLowerCase();
  const nome    = e.parameter.nome    || "";
  const dia     = parseInt(e.parameter.dia || "0");
  const usuario = e.parameter.usuario || "";
  const senha   = e.parameter.senha   || "";

  try {
    // ── Rotas públicas (sem auth) ──
    if (action === "listar_usuarios")  return respond(listarUsuarios());
    if (action === "info")             return respond(getInfo(nome));
    if (action === "get_meditacoes")   return respond(getMeditacoes(dia));
    if (action === "get_todas_med")    return respond(getTodasMeditacoes());
    if (action === "curtir")           return respond(curtir(e.parameter.med_id, nome));
    if (action === "get_comentarios")  return respond(getComentarios(e.parameter.med_id));
    if (action === "comentar")         return respond(comentar(e.parameter.med_id, nome, e.parameter.texto || ""));

    // ── Login admin ──
    if (action === "login_admin") {
      const admin = autenticar(usuario, senha);
      if (!admin) return respond({ error: "Usuário ou senha incorretos" });
      return respond({
        ok: true,
        nome:    admin.nome,
        papel:   admin.papel,
        role:    admin.role,
        usuario: admin.usuario
      });
    }

    // ── Rotas admin (requerem autenticação) ──
    if (["publicar","moderar_med","moderar_com",
         "criar_admin","listar_admins","remover_admin",
         "trocar_senha","get_todas_med_admin"].includes(action)) {
      const admin = autenticar(usuario, senha);
      if (!admin) return respond({ error: "Usuário ou senha incorretos" });

      if (action === "publicar")          return respond(publicar(admin, e.parameter));
      if (action === "moderar_med")       return respond(moderarMed(admin, e.parameter.med_id, e.parameter.ativa));
      if (action === "moderar_com")       return respond(moderarCom(admin, e.parameter.com_id, e.parameter.ativa));
      if (action === "criar_admin")       return respond(criarAdmin(admin, e.parameter));
      if (action === "listar_admins")     return respond(listarAdmins(admin));
      if (action === "remover_admin")     return respond(removerAdmin(admin, e.parameter.alvo));
      if (action === "trocar_senha")      return respond(trocarSenha(admin, e.parameter.nova_senha));
      if (action === "get_todas_med_admin") return respond(getTodasMeditacoes(true));
      if (action === "editar_med")       return respond(editarMed(admin, e.parameter));
    }

    // ── Rotas do plano de leitura (por nome de usuário) ──
    if (!nome) return respond({ error: "Parâmetro 'nome' obrigatório" });
    if (action === "get")          return respond(getAllData(nome));
    if (action === "marcar")       return respond(marcarCaps(nome, e.parameter.caps||"", e.parameter.done));
    if (action === "salvar_plano") return respond(salvarPlano(nome, e.parameter.config||""));
    if (action === "limpar_legado")return respond(limparLegado(nome));
    if (action === "salvar_nota")  return respond(salvarNota(nome, dia, e.parameter.tags||"", e.parameter.nota||""));

    return respond({ error: "Ação desconhecida: " + action });
  } catch(err) {
    return respond({ error: err.toString() });
  }
}

// ── CRUD de admins ───────────────────────────────────────────────────

function listarAdmins(admin) {
  if (!podeModerar(admin)) return { error: "Sem permissão" };
  const s    = getAdminsSheet();
  const rows = s.getDataRange().getValues();
  const lista = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    lista.push({
      usuario: r[0], nome: r[2], papel: r[3],
      role: r[4], ativo: r[5], criado: r[6]
    });
  }
  return { admins: lista };
}

function criarAdmin(admin, p) {
  if (!isSuperadmin(admin)) return { error: "Apenas superadmin pode criar usuários" };
  const usuario = (p.novo_usuario||"").toLowerCase().trim().replace(/[^a-z0-9_.]/g,"");
  const senha   = (p.nova_senha||"").trim();
  const nome    = (p.novo_nome||"").trim();
  const papel   = (p.novo_papel||"").trim();
  const role    = ["superadmin","pastor","colaborador"].includes(p.novo_role) ? p.novo_role : "colaborador";

  if (usuario.length < 3)  return { error: "Usuário deve ter pelo menos 3 caracteres" };
  if (senha.length < 6)    return { error: "Senha deve ter pelo menos 6 caracteres" };
  if (!nome)               return { error: "Nome de exibição obrigatório" };

  // Verificar se já existe
  const s    = getAdminsSheet();
  const rows = s.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === usuario) return { error: "Usuário '" + usuario + "' já existe" };
  }

  s.appendRow([usuario, senha, nome, papel, role, true, new Date().toISOString()]);
  return { ok: true, usuario, role };
}

function removerAdmin(admin, alvo) {
  if (!isSuperadmin(admin)) return { error: "Apenas superadmin pode remover usuários" };
  if (alvo === admin.usuario) return { error: "Você não pode remover a si mesmo" };
  const s    = getAdminsSheet();
  const rows = s.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === alvo) {
      s.getRange(i+1, 6).setValue(false); // desativar, não apagar (preserva histórico)
      return { ok: true };
    }
  }
  return { error: "Usuário não encontrado" };
}

function trocarSenha(admin, novaSenha) {
  if (!novaSenha || novaSenha.trim().length < 6) return { error: "Senha deve ter pelo menos 6 caracteres" };
  const s = getAdminsSheet();
  s.getRange(admin.row, 2).setValue(novaSenha.trim());
  return { ok: true };
}

// ── Progresso de leitura ─────────────────────────────────────────────

function getAllData(nomeRaw) {
  const sheet = getOrCreateUserSheet(nomeRaw);
  return {
    nome:        nomeRaw.trim(),
    plano:       getJSON(sheet, "plano", null),
    lidos:       getJSON(sheet, "lidos", {}),
    notas:       getJSON(sheet, "notas", {}),
    legado_dias: getJSON(sheet, "legado_dias", []),
  };
}

// Marca/desmarca um ou mais capítulos. caps = "GEN.1,GEN.2,..."
function marcarCaps(nomeRaw, capsStr, doneParam) {
  const caps = String(capsStr||"").split(",").map(s=>s.trim()).filter(Boolean);
  if (!caps.length) return { error: "Nenhum capítulo informado" };
  const done  = doneParam==="true"||doneParam===true;
  const sheet = getOrCreateUserSheet(nomeRaw);
  const lidos = getJSON(sheet, "lidos", {});
  const agora = new Date().toISOString();
  for (const ref of caps) { if (done) lidos[ref]=agora; else delete lidos[ref]; }
  setCampo(sheet, "lidos", JSON.stringify(lidos));
  return { ok:true, done, total_lidos: Object.keys(lidos).length };
}

function salvarPlano(nomeRaw, configStr) {
  let cfg; try { cfg = JSON.parse(configStr); } catch(e) { return { error: "Config inválida" }; }
  const sheet = getOrCreateUserSheet(nomeRaw);
  setCampo(sheet, "plano", JSON.stringify(cfg));
  return { ok:true };
}

function salvarNota(nomeRaw, dia, tags, nota) {
  if (!dia||dia<1) return { error: "Dia inválido" };
  const sheet = getOrCreateUserSheet(nomeRaw);
  const notas = getJSON(sheet, "notas", {});
  notas[String(dia)] = { tags: tags?String(tags).split(",").filter(Boolean):[], texto: String(nota||"") };
  setCampo(sheet, "notas", JSON.stringify(notas));
  return { dia, ok:true };
}

function limparLegado(nomeRaw) {
  const sheet = getOrCreateUserSheet(nomeRaw);
  setCampo(sheet, "legado_dias", "[]");
  return { ok:true };
}

function getInfo(nomeRaw) {
  if (!nomeRaw) return { error: "Nome obrigatório" };
  const sheet = getOrCreateUserSheet(nomeRaw);
  const lidos = getJSON(sheet, "lidos", {});
  return { nome: nomeRaw.trim(), caps_lidos: Object.keys(lidos).length, total: TOTAL_CAPS_BIBLIA };
}

// total de capítulos da Bíblia (referência para percentuais/ranking)
const TOTAL_CAPS_BIBLIA = 1189;

function listarUsuarios() {
  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  const idx = ss.getSheetByName("usuarios");
  if (!idx) return { usuarios: [] };
  const dados = idx.getDataRange().getValues();
  const lista = [];
  for (let i = 1; i < dados.length; i++) if (dados[i][0]) lista.push({ nome_aba: dados[i][0], nome: dados[i][1] });
  return { usuarios: lista };
}

// ── Meditações ───────────────────────────────────────────────────────

function getMeditacoes(dia) {
  const s    = getMeditacoesSheet();
  const rows = s.getDataRange().getValues();
  const res  = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const ativa = r[9]===true||r[9]==="TRUE"||r[9]==="true"||r[9]==="";
    if (Number(r[1])===dia && ativa)
      res.push({ id:r[0],dia:r[1],autor:r[2],papel:r[3],tipo:r[4],titulo:r[5],texto:r[6],data:r[7],curtidas:Number(r[8]||0),
                 livro:r[10]||"",cap_ini:Number(r[11]||0),cap_fim:Number(r[12]||0) });
  }
  return { meditacoes: res };
}

function getTodasMeditacoes(incluirInativas) {
  const s    = getMeditacoesSheet();
  const rows = s.getDataRange().getValues();
  const res  = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const ativa = r[9]===true||r[9]==="TRUE"||r[9]==="true"||r[9]==="";
    if (!incluirInativas && !ativa) continue;
    res.push({ id:r[0],dia:r[1],autor:r[2],papel:r[3],tipo:r[4],titulo:r[5],texto:String(r[6]||""),
               data:r[7],curtidas:Number(r[8]||0),ativa,
               livro:r[10]||"",cap_ini:Number(r[11]||0),cap_fim:Number(r[12]||0) });
  }
  return { meditacoes: res };
}

function publicar(admin, p) {
  if (!podePublicar(admin)) return { error: "Sem permissão para publicar" };
  const titulo = (p.titulo||"").trim();
  const texto  = (p.texto||"").trim();
  const autor  = admin.nome; // sempre usa o nome do admin autenticado
  const livro  = (p.livro||"").trim().toUpperCase();
  const capIni = parseInt(p.cap_ini||"0");
  const capFim = parseInt(p.cap_fim||p.cap_ini||"0");
  if (!livro)            return { error: "Livro obrigatório" };
  if (!capIni||capIni<1) return { error: "Capítulo inicial inválido" };
  if (capFim<capIni)     return { error: "Capítulo final menor que o inicial" };
  if (!titulo)           return { error: "Título obrigatório" };
  if (texto.length < 30) return { error: "Texto muito curto (mínimo 30 caracteres)" };
  const s  = getMeditacoesSheet();
  const id = gerarId();
  s.appendRow([id, 0, autor, admin.papel, p.tipo||"Devocional", titulo, texto, new Date().toISOString(), 0, true, livro, capIni, capFim]);
  return { ok: true, id };
}

function moderarMed(admin, medId, ativa) {
  if (!podeModerar(admin)) return { error: "Sem permissão para moderar" };
  const s    = getMeditacoesSheet();
  const rows = s.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === medId) {
      s.getRange(i+1,10).setValue(ativa==="true"||ativa===true);
      return { ok: true };
    }
  }
  return { error: "Meditação não encontrada" };
}

// ── Curtidas ─────────────────────────────────────────────────────────

function curtir(medId, nomeRaw) {
  if (!medId||!nomeRaw) return { error: "med_id e nome obrigatórios" };
  const cs   = getCurtidasSheet();
  const rows = cs.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0]===medId && rows[i][1]===nomeRaw.trim()) {
      cs.deleteRow(i+1);
      return { ok:true, acao:"descurtiu", curtidas: atualizarCurtidas(medId,-1) };
    }
  }
  cs.appendRow([medId, nomeRaw.trim(), new Date().toISOString()]);
  return { ok:true, acao:"curtiu", curtidas: atualizarCurtidas(medId,1) };
}

function atualizarCurtidas(medId, delta) {
  const s    = getMeditacoesSheet();
  const rows = s.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0]===medId) {
      const novo = Math.max(0, Number(rows[i][8]||0)+delta);
      s.getRange(i+1,9).setValue(novo);
      return novo;
    }
  }
  return 0;
}

// ── Comentários ──────────────────────────────────────────────────────

function getComentarios(medId) {
  if (!medId) return { comentarios:[] };
  const s    = getComentariosSheet();
  const rows = s.getDataRange().getValues();
  const res  = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const ativa = r[5]===true||r[5]==="TRUE"||r[5]==="true"||r[5]==="";
    if (r[1]===medId && ativa)
      res.push({ id:r[0],med_id:r[1],autor:r[2],texto:r[3],data:r[4] });
  }
  return { comentarios: res };
}

function comentar(medId, nomeRaw, texto) {
  if (!medId||!nomeRaw||!texto.trim()) return { error: "Campos obrigatórios" };
  if (texto.trim().length > 1000)      return { error: "Comentário muito longo (máx 1000 chars)" };
  const s  = getComentariosSheet();
  const id = gerarId();
  s.appendRow([id, medId, nomeRaw.trim(), texto.trim(), new Date().toISOString(), true]);
  return { ok:true, id };
}

function moderarCom(admin, comId, ativa) {
  if (!podeModerar(admin)) return { error: "Sem permissão para moderar" };
  const s    = getComentariosSheet();
  const rows = s.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0]===comId) { s.getRange(i+1,6).setValue(false); return { ok:true }; }
  }
  return { error: "Comentário não encontrado" };
}

// ── Edição de meditação ──────────────────────────────────────────────
// Adicionar ao roteador existente (dentro do bloco de rotas admin):
// if (action === "editar_med") return respond(editarMed(admin, e.parameter));

function editarMed(admin, p) {
  if (!podePublicar(admin)) return { error: "Sem permissão" };
  const medId = p.med_id || "";
  if (!medId) return { error: "med_id obrigatório" };

  const s    = getMeditacoesSheet();
  const rows = s.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] !== medId) continue;

    // Colaborador só pode editar as próprias meditações
    if (!podeModerar(admin) && rows[i][2] !== admin.nome) {
      return { error: "Você só pode editar suas próprias meditações" };
    }

    const tipo   = p.tipo             || rows[i][4];
    const titulo = (p.titulo || "").trim() || rows[i][5];
    const texto  = (p.texto  || "").trim() || rows[i][6];
    const livro  = (p.livro||"").trim().toUpperCase() || rows[i][10];
    const capIni = parseInt(p.cap_ini) || Number(rows[i][11]);
    const capFim = parseInt(p.cap_fim) || Number(rows[i][12]) || capIni;

    if (!titulo)           return { error: "Título obrigatório" };
    if (texto.length < 30) return { error: "Texto muito curto (mínimo 30 caracteres)" };
    if (capFim<capIni)     return { error: "Capítulo final menor que o inicial" };

    s.getRange(i+1, 5).setValue(tipo);
    s.getRange(i+1, 6).setValue(titulo);
    s.getRange(i+1, 7).setValue(texto);
    s.getRange(i+1, 11).setValue(livro);
    s.getRange(i+1, 12).setValue(capIni);
    s.getRange(i+1, 13).setValue(capFim);

    return { ok: true, id: medId };
  }
  return { error: "Meditação não encontrada" };
}
