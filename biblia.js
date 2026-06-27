/* ═══════════════════════════════════════════════════════════════════
   biblia.js — Fonte ÚNICA da Bíblia para todo o app
   Dataset dos 66 livros + gerador de planos + helpers de exibição.
   Carregado por index.html, admin.html e meditacoes.html (antes do
   script da página). Não edite a lista de livros em outro lugar.
   ═══════════════════════════════════════════════════════════════════ */

// id = código USFM do bible.com (versão 129 = NVI). caps = nº de capítulos.
const BIBLIA = [
  {id:"GEN",nome:"Gênesis",caps:50,test:"AT"},{id:"EXO",nome:"Êxodo",caps:40,test:"AT"},
  {id:"LEV",nome:"Levítico",caps:27,test:"AT"},{id:"NUM",nome:"Números",caps:36,test:"AT"},
  {id:"DEU",nome:"Deuteronômio",caps:34,test:"AT"},{id:"JOS",nome:"Josué",caps:24,test:"AT"},
  {id:"JDG",nome:"Juízes",caps:21,test:"AT"},{id:"RUT",nome:"Rute",caps:4,test:"AT"},
  {id:"1SA",nome:"1 Samuel",caps:31,test:"AT"},{id:"2SA",nome:"2 Samuel",caps:24,test:"AT"},
  {id:"1KI",nome:"1 Reis",caps:22,test:"AT"},{id:"2KI",nome:"2 Reis",caps:25,test:"AT"},
  {id:"1CH",nome:"1 Crônicas",caps:29,test:"AT"},{id:"2CH",nome:"2 Crônicas",caps:36,test:"AT"},
  {id:"EZR",nome:"Esdras",caps:10,test:"AT"},{id:"NEH",nome:"Neemias",caps:13,test:"AT"},
  {id:"EST",nome:"Ester",caps:10,test:"AT"},{id:"JOB",nome:"Jó",caps:42,test:"AT"},
  {id:"PSA",nome:"Salmos",caps:150,test:"AT"},{id:"PRO",nome:"Provérbios",caps:31,test:"AT"},
  {id:"ECC",nome:"Eclesiastes",caps:12,test:"AT"},{id:"SNG",nome:"Cantares",caps:8,test:"AT"},
  {id:"ISA",nome:"Isaías",caps:66,test:"AT"},{id:"JER",nome:"Jeremias",caps:52,test:"AT"},
  {id:"LAM",nome:"Lamentações",caps:5,test:"AT"},{id:"EZK",nome:"Ezequiel",caps:48,test:"AT"},
  {id:"DAN",nome:"Daniel",caps:12,test:"AT"},{id:"HOS",nome:"Oséias",caps:14,test:"AT"},
  {id:"JOL",nome:"Joel",caps:3,test:"AT"},{id:"AMO",nome:"Amós",caps:9,test:"AT"},
  {id:"OBA",nome:"Obadias",caps:1,test:"AT"},{id:"JON",nome:"Jonas",caps:4,test:"AT"},
  {id:"MIC",nome:"Miquéias",caps:7,test:"AT"},{id:"NAM",nome:"Naum",caps:3,test:"AT"},
  {id:"HAB",nome:"Habacuque",caps:3,test:"AT"},{id:"ZEP",nome:"Sofonias",caps:3,test:"AT"},
  {id:"HAG",nome:"Ageu",caps:2,test:"AT"},{id:"ZEC",nome:"Zacarias",caps:14,test:"AT"},
  {id:"MAL",nome:"Malaquias",caps:4,test:"AT"},{id:"MAT",nome:"Mateus",caps:28,test:"NT"},
  {id:"MRK",nome:"Marcos",caps:16,test:"NT"},{id:"LUK",nome:"Lucas",caps:24,test:"NT"},
  {id:"JHN",nome:"João",caps:21,test:"NT"},{id:"ACT",nome:"Atos",caps:28,test:"NT"},
  {id:"ROM",nome:"Romanos",caps:16,test:"NT"},{id:"1CO",nome:"1 Coríntios",caps:16,test:"NT"},
  {id:"2CO",nome:"2 Coríntios",caps:13,test:"NT"},{id:"GAL",nome:"Gálatas",caps:6,test:"NT"},
  {id:"EPH",nome:"Efésios",caps:6,test:"NT"},{id:"PHP",nome:"Filipenses",caps:4,test:"NT"},
  {id:"COL",nome:"Colossenses",caps:4,test:"NT"},{id:"1TH",nome:"1 Tessalonicenses",caps:5,test:"NT"},
  {id:"2TH",nome:"2 Tessalonicenses",caps:3,test:"NT"},{id:"1TI",nome:"1 Timóteo",caps:6,test:"NT"},
  {id:"2TI",nome:"2 Timóteo",caps:4,test:"NT"},{id:"TIT",nome:"Tito",caps:3,test:"NT"},
  {id:"PHM",nome:"Filemom",caps:1,test:"NT"},{id:"HEB",nome:"Hebreus",caps:13,test:"NT"},
  {id:"JAS",nome:"Tiago",caps:5,test:"NT"},{id:"1PE",nome:"1 Pedro",caps:5,test:"NT"},
  {id:"2PE",nome:"2 Pedro",caps:3,test:"NT"},{id:"1JN",nome:"1 João",caps:5,test:"NT"},
  {id:"2JN",nome:"2 João",caps:1,test:"NT"},{id:"3JN",nome:"3 João",caps:1,test:"NT"},
  {id:"JUD",nome:"Judas",caps:1,test:"NT"},{id:"REV",nome:"Apocalipse",caps:22,test:"NT"},
];
const _BOOK={}; BIBLIA.forEach((b,i)=>{b.ord=i;_BOOK[b.id]=b;});
const TOTAL_CAPS=BIBLIA.reduce((s,b)=>s+b.caps,0); // 1189
const _NT_REFS=[]; BIBLIA.filter(b=>b.test==="NT").forEach(b=>{for(let c=1;c<=b.caps;c++)_NT_REFS.push(b.id+"."+c);});
const CRONOLOGICA=["JOB","GEN","EXO","LEV","NUM","DEU","JOS","JDG","RUT","1SA","2SA","PSA","1CH","PRO","ECC","SNG","1KI","2CH","OBA","JOL","JON","AMO","HOS","ISA","MIC","NAM","ZEP","HAB","JER","LAM","2KI","EZK","DAN","EZR","EST","NEH","HAG","ZEC","MAL","MAT","MRK","LUK","JHN","ACT","JAS","GAL","1TH","2TH","1CO","2CO","ROM","EPH","PHP","COL","PHM","1TI","TIT","1PE","HEB","2TI","2PE","1JN","2JN","3JN","JUD","REV"];

function _refsDeLivros(ids){const out=[];for(const id of ids){const b=_BOOK[id];for(let c=1;c<=b.caps;c++)out.push(id+"."+c);}return out;}
const ORDENS={
  sequencial:()=>({streams:[_refsDeLivros(BIBLIA.map(b=>b.id))]}),
  intercalado:()=>({streams:[_refsDeLivros(BIBLIA.filter(b=>b.test==="AT").map(b=>b.id)),_refsDeLivros(BIBLIA.filter(b=>b.test==="NT").map(b=>b.id))]}),
  cronologica:()=>({streams:[_refsDeLivros(CRONOLOGICA)]}),
  nt:()=>({streams:[_refsDeLivros(BIBLIA.filter(b=>b.test==="NT").map(b=>b.id))]}),
  evangelhos:()=>({streams:[_refsDeLivros(["MAT","MRK","LUK","JHN"])]}),
};
const ORDEM_NOMES={sequencial:"Sequencial (Gênesis → Apocalipse)",intercalado:"Intercalado (AT + NT juntos)",cronologica:"Cronológica (ordem dos eventos)",nt:"Só Novo Testamento",evangelhos:"Só os Evangelhos"};
// distribui Ls itens em D dias espalhando o resto (Bresenham)
function _tamanhos(Ls,D){const out=[];for(let i=0;i<D;i++)out.push(Math.floor((i+1)*Ls/D)-Math.floor(i*Ls/D));return out;}
function _comprimir(refs){
  const bl=[];
  for(const r of refs){const[id,cs]=r.split(".");const cap=+cs,b=_BOOK[id],u=bl[bl.length-1];
    if(u&&u.id===id&&cap===u.fim+1)u.fim=cap;else bl.push({id,nome:b.nome,test:b.test,ini:cap,fim:cap});}
  return bl.map(b=>({livro:b.nome,test:b.test,ref:b.ini===b.fim?`${b.nome} ${b.ini}`:`${b.nome} ${b.ini}–${b.fim}`,url:`https://www.bible.com/pt/bible/129/${b.id}.${b.ini}.NVI`,caps:b.fim-b.ini+1}));
}
function gerarPlano(cfg){
  const{streams}=(ORDENS[cfg.ordem]||ORDENS.sequencial)();
  const L=streams.reduce((s,st)=>s+st.length,0);
  let D=cfg.modo==="ritmo"?Math.ceil(L/Math.max(1,cfg.capsDia)):Math.round((cfg.meses||6)*30.4);
  D=Math.max(1,D);
  const tams=streams.map(st=>_tamanhos(st.length,D)),cur=streams.map(()=>0),dias=[];
  for(let i=0;i<D;i++){
    const rd=[];streams.forEach((st,si)=>{for(let k=0;k<tams[si][i];k++)rd.push(st[cur[si]++]);});
    const bl=_comprimir(rd);
    dias.push({dia:i+1,refs:rd,at:bl.filter(b=>b.test==="AT"),nt:bl.filter(b=>b.test==="NT"),salmo:null,total_caps:rd.length});
  }
  return{config:cfg,total_dias:D,total_caps:L,dias};
}

/* ── Helpers de exibição (usados por admin.html e meditacoes.html) ── */
// LIVROS = [[id,nome,caps], ...] na ordem canônica — para selects e rótulos.
const LIVROS=BIBLIA.map(b=>[b.id,b.nome,b.caps]);
function livroNome(id){ return _BOOK[id]?.nome || id || "?"; }
function livroCaps(id){ return _BOOK[id]?.caps || 0; }
function livroOrd(id){ return _BOOK[id] ? _BOOK[id].ord : 999; }
// rótulo de um trecho de meditação { livro, cap_ini, cap_fim } → "Gênesis 1–3"
function refLabel(m){
  const nome=livroNome(m.livro);
  const ini=m.cap_ini||0, fim=m.cap_fim||ini;
  if(!ini) return nome;
  return fim>ini ? `${nome} ${ini}–${fim}` : `${nome} ${ini}`;
}
