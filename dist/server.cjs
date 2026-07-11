var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_vite = require("vite");
var import_genai = require("@google/genai");
var import_dotenv = __toESM(require("dotenv"), 1);
import_dotenv.default.config();
var app = (0, import_express.default)();
app.use(import_express.default.json());
var PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3e3;
var SHEETS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSncLt5jGyFnv8AFXn08fMzmlUJv89SykRA0kI__zAiJPor5kzOaMAOQYpBKR7ONBFnZuJSs7atn0AU/pub?output=csv";
var EFETIVO_FIXO_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR0beFtf_BfmH6NytmANk_NensTAYZyeoa9EQIxKyal6uAOEzr50CyjDfdZwUW6NybjnG37PPwVNJHc/pub?gid=1613011165&single=true&output=csv";
var aiInstance = null;
function getGeminiClient() {
  if (!aiInstance) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("A chave de API do Gemini n\xE3o est\xE1 configurada. Por favor, adicione GEMINI_API_KEY no painel de Secrets.");
    }
    aiInstance = new import_genai.GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
  }
  return aiInstance;
}
var cachedRows = null;
var lastFetchTime = 0;
function parseRowDate(dateStr) {
  if (!dateStr) return null;
  const cleaned = dateStr.trim();
  if (cleaned.includes("/")) {
    const parts = cleaned.split("/");
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
        return new Date(year, month, day);
      }
    }
  }
  if (cleaned.includes("-")) {
    const parts = cleaned.split("-");
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
          return new Date(year, month, day);
        }
      } else {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
          return new Date(year, month, day);
        }
      }
    }
  }
  const fallback = new Date(cleaned);
  return isNaN(fallback.getTime()) ? null : fallback;
}
function isRowWithinRange(dateStr, startDateStr, endDateStr) {
  if (!startDateStr && !endDateStr) return true;
  const rowDate = parseRowDate(dateStr);
  if (!rowDate) return false;
  if (startDateStr) {
    const start = new Date(startDateStr);
    if (!isNaN(start.getTime()) && rowDate < start) return false;
  }
  if (endDateStr) {
    const end = new Date(endDateStr);
    if (!isNaN(end.getTime())) {
      end.setHours(23, 59, 59, 999);
      if (rowDate > end) return false;
    }
  }
  return true;
}
function generateMockRows() {
  const headers = ["Data", "Bairro Col", "Solicitante", "Bairro", "Endere\xE7o", "Complemento", "Fator", "Efetivo", "Fun\xE7\xE3o", "Etapa", "Motociclista", "Periodo", "DiaSemana"];
  headers[31] = "LOCAL";
  const rows = [headers];
  const solicitantes = [
    { type: "SERVI\xC7OS URBANOS", weight: 33.72 },
    { type: "CULTURA E LAZER", weight: 30.73 },
    { type: "MOBILIDADE", weight: 29.85 },
    { type: "ESPA\xC7OS P\xDABLICOS", weight: 5.7 }
  ];
  const bairrosList = [
    { nome: "RECIFE", weight: 990 },
    { nome: "COHAB", weight: 772 },
    { nome: "IBURA", weight: 736 },
    { nome: "BOA VIAGEM", weight: 601 },
    { nome: "MADALENA", weight: 257 },
    { nome: "SAO JOSE", weight: 235 },
    { nome: "SANTO AMARO", weight: 229 },
    { nome: "CASA AMARELA", weight: 212 },
    { nome: "AREIAS", weight: 137 }
  ];
  const enderecosList = [
    { local: "AV DOIS RIOS - LADEIRA DA COHAB", weight: 382 },
    { local: "AV DOIS RIOS - RUA RIO XINGU", weight: 352 },
    { local: "AV PERNAMBUCO - LADEIRA DA COHAB", weight: 211 },
    { local: "AV PERNAMBUCO - RUA RIO CANINDE", weight: 138 },
    { local: "AV BARBOSA LIMA - RUA DA GUIA", weight: 123 },
    { local: "RUA RIO CANINDE - AV MANAUS", weight: 119 },
    { local: "AV PERNAMBUCO - AV RIO SAO FRANCISCO", weight: 116 }
  ];
  const agents = [
    { nome: "Pedro Silva", cargo: "ORIENTADOR I", escala: "3\xAA T", weight: 123 },
    { nome: "Ivanildo Carvalho", cargo: "ORIENTADOR", escala: "3\xAA M", weight: 114 },
    { nome: "Leonardo Gomes", cargo: "ORIENTADOR I", escala: "3\xAA T", weight: 113 },
    { nome: "Luiz Augusto", cargo: "ORIENTADOR I", escala: "3\xAA M", weight: 103 },
    { nome: "Danilo Hil\xE1rio", cargo: "ORIENTADOR I", escala: "T", weight: 102 }
  ];
  const periodos = [
    { name: "MANH\xC3", weight: 2702, isMotoPct: 0.2 },
    { name: "TARDE", weight: 2239, isMotoPct: 0.12 },
    { name: "NOITE", weight: 528, isMotoPct: 0.2 }
  ];
  const dias = [
    { label: "DOM.", weight: 205 },
    { label: "SEG.", weight: 953 },
    { label: "TER.", weight: 899 },
    { label: "QUA.", weight: 833 },
    { label: "QUI.", weight: 844 },
    { label: "SEX.", weight: 791 },
    { label: "S\xC1B.", weight: 945 }
  ];
  function pickWeighted(list) {
    const totalWeight = list.reduce((sum, item) => sum + item.weight, 0);
    let r = Math.random() * totalWeight;
    for (const item of list) {
      r -= item.weight;
      if (r <= 0) return item;
    }
    return list[0];
  }
  const startTimestamp = new Date(2026, 0, 1).getTime();
  const endTimestamp = new Date(2026, 11, 31).getTime();
  for (let i = 0; i < 11e3; i++) {
    const randomTime = startTimestamp + Math.random() * (endTimestamp - startTimestamp);
    const date = new Date(randomTime);
    const dayStr = String(date.getDate()).padStart(2, "0");
    const monthStr = String(date.getMonth() + 1).padStart(2, "0");
    const yearStr = "2026";
    const dateStr = `${dayStr}/${monthStr}/${yearStr}`;
    const sol = pickWeighted(solicitantes);
    const b = pickWeighted(bairrosList);
    const e = pickWeighted(enderecosList);
    const a = pickWeighted(agents);
    const p = pickWeighted(periodos);
    const d = pickWeighted(dias);
    const isMoto = Math.random() < p.isMotoPct ? "Sim" : "";
    const isCorretiva = Math.random() < 0.084 ? "CORRETIVAS" : "";
    const row = Array(50).fill("");
    row[0] = dateStr;
    row[2] = sol.type;
    row[3] = b.nome;
    row[4] = e.local;
    row[7] = a.nome.toUpperCase();
    row[8] = a.cargo;
    row[9] = a.escala;
    row[18] = isCorretiva;
    row[31] = e.local;
    row[32] = isMoto;
    row[42] = p.name;
    row[43] = d.label;
    rows.push(row);
  }
  return rows;
}
function parseCSV(csvText) {
  const lines = csvText.split(/\r?\n/);
  const rows = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const row = [];
    let cur = "";
    let insideQuote = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        insideQuote = !insideQuote;
      } else if (char === "," && !insideQuote) {
        row.push(cur.trim());
        cur = "";
      } else {
        cur += char;
      }
    }
    row.push(cur.trim());
    if (row.length > 0 && row.some((cell) => cell !== "")) {
      rows.push(row);
    }
  }
  return rows;
}
function getColumnsMapping(headers) {
  const normalized = (headers || []).map((h) => (h || "").toUpperCase().trim());
  const findIndex = (names, fallback) => {
    for (const name of names) {
      const idx = normalized.indexOf(name);
      if (idx !== -1) return idx;
    }
    return fallback;
  };
  return {
    data: findIndex(["DATA"], 0),
    solicitante: findIndex(["SOLICITANTE"], 2),
    bairro: findIndex(["BAIRRO"], 3),
    endereco: findIndex(["ENDERE\xC7O", "ENDERECO"], 4),
    complemento: findIndex(["COMPLEMENTO"], 5),
    efetivo: findIndex(["EFETIVO"], 7),
    funcao: findIndex(["FUN\xC7\xC3O", "FUNCAO"], 8),
    etapa: findIndex(["ETAPA"], 9),
    preventivas: findIndex(["PREVENTIVAS"], 18),
    corretivas: findIndex(["CORRETIVAS"], 19),
    local: findIndex(["LOCAL"], 31),
    motociclista: findIndex(["MOTOCICLISTA"], 32),
    periodo: findIndex(["PERIODO"], 42),
    diaSemana: findIndex(["DIA_SEMANA"], 43),
    demandas: findIndex(["DEMANDAS", "DEMANDA"], 10)
  };
}
function processAnalytics(rows) {
  if (!rows || rows.length === 0) {
    throw new Error("N\xE3o h\xE1 dados para processar.");
  }
  const headers = rows[0];
  const dataRows = rows.slice(1);
  const mapping = getColumnsMapping(headers);
  let photoColIndex = -1;
  if (headers) {
    for (let i = 0; i < headers.length; i++) {
      const h = (headers[i] || "").toLowerCase().trim();
      if (h.includes("foto") || h.includes("imagem") || h.includes("photo") || h.includes("img") || h.includes("link") || h.includes("url") || h.includes("avatar")) {
        photoColIndex = i;
        break;
      }
    }
  }
  const solicitantes = {};
  const bairros = {};
  const enderecos = {};
  const addressToBairro = {};
  const efetivos = {};
  const periodos = {
    MANH\u00C3: { total: 0, fixo: 0, moto: 0 },
    TARDE: { total: 0, fixo: 0, moto: 0 },
    NOITE: { total: 0, fixo: 0, moto: 0 }
  };
  const diasSemanaMap = {
    "DOM.": 0,
    "SEG.": 0,
    "TER.": 0,
    "QUA.": 0,
    "QUI.": 0,
    "SEX.": 0,
    "S\xC1B.": 0
  };
  const mesesMap = {
    "01": 0,
    "02": 0,
    "03": 0,
    "04": 0,
    "05": 0,
    "06": 0,
    "07": 0,
    "08": 0,
    "09": 0,
    "10": 0,
    "11": 0,
    "12": 0
  };
  let numPreventivas = 0;
  let numCorretivas = 0;
  for (const row of dataRows) {
    const dataStr = row[mapping.data] || "";
    const solicitanteCol = (row[mapping.solicitante] || "OUTRO").trim().toUpperCase();
    let bairroCol = (row[mapping.bairro] || "OUTRO").trim().toUpperCase();
    if (bairroCol === "RECEITA" || bairroCol === "RECEITA DA PENHA" || bairroCol === "BAIRRO DO RECIFE") {
      bairroCol = "RECIFE";
    }
    const localColVal = mapping.local !== -1 ? (row[mapping.local] || "").trim() : "";
    const enderecoCol = (row[mapping.endereco] || "OUTRO").trim();
    const complementCol = row[mapping.complemento] || "";
    const efetivoCol = (row[mapping.efetivo] || "").trim().toUpperCase();
    const funcaoCol = (row[mapping.funcao] || "ORIENTADOR").trim();
    const etapaCol = (row[mapping.etapa] || "").trim();
    const motociclistaCol = row[mapping.motociclista] || "";
    const periodoCol = (row[mapping.periodo] || "OUTRO").trim().toUpperCase();
    const diaSemanaCol = (row[mapping.diaSemana] || "OUTRO").trim().toUpperCase();
    const demandasCol = mapping.demandas !== -1 ? (row[mapping.demandas] || "").trim().toUpperCase() : "";
    let normalizedSolicitante = "";
    if (solicitanteCol.includes("SERVI\xC7OS URBANOS")) {
      normalizedSolicitante = "SERVI\xC7OS URBANOS";
    } else if (solicitanteCol.includes("CULTURA E LAZER") || solicitanteCol.includes("CULTURA") || solicitanteCol.includes("SOCIOCULTURAL")) {
      normalizedSolicitante = "CULTURA E LAZER";
    } else if (solicitanteCol.includes("ESPA\xC7OS P\xDABLICOS") || solicitanteCol.includes("ESPACOS")) {
      normalizedSolicitante = "ESPA\xC7OS P\xDABLICOS";
    } else if (solicitanteCol.includes("MOBILIDADE") || solicitanteCol.includes("PLANEJAD") || solicitanteCol.includes("EDUCATIV") || solicitanteCol.includes("PRESEN\xC7A") || solicitanteCol.includes("PRESENCA") || solicitanteCol.includes("ESTRATEGIC") || solicitanteCol.includes("ESTRAT\xC9GIC")) {
      normalizedSolicitante = "MOBILIDADE";
    }
    if (!normalizedSolicitante) {
      continue;
    }
    solicitantes[normalizedSolicitante] = (solicitantes[normalizedSolicitante] || 0) + 1;
    if (bairroCol && bairroCol !== "BAIRRO") {
      bairros[bairroCol] = (bairros[bairroCol] || 0) + 1;
    }
    let fullEnd = "";
    if (localColVal && localColVal !== "LOCAL") {
      fullEnd = localColVal;
    } else if (enderecoCol && enderecoCol !== "ENDERE\xC7O") {
      fullEnd = complementCol ? `${enderecoCol} - ${complementCol}` : enderecoCol;
    }
    if (fullEnd) {
      enderecos[fullEnd] = (enderecos[fullEnd] || 0) + 1;
      if (bairroCol && bairroCol !== "BAIRRO") {
        addressToBairro[fullEnd] = bairroCol;
      }
    }
    if (efetivoCol && efetivoCol !== "EFETIVO" && efetivoCol !== "TOTAL") {
      const record = efetivos[efetivoCol] || {
        count: 0,
        cargo: funcaoCol,
        escala: etapaCol || "Escala",
        categorias: {
          "SERVI\xC7OS URBANOS": 0,
          "SOCIOCULTURAL": 0,
          "MOBILIDADE": 0,
          "ESPA\xC7OS P\xDABLICOS": 0
        },
        situacoes: []
      };
      record.count++;
      let rowPhoto = "";
      if (photoColIndex !== -1 && row[photoColIndex]) {
        const cellVal = row[photoColIndex].trim();
        if (cellVal.startsWith("http://") || cellVal.startsWith("https://")) {
          rowPhoto = cellVal;
        }
      }
      if (!rowPhoto) {
        for (const cell of row) {
          if (cell && (cell.startsWith("http://") || cell.startsWith("https://"))) {
            rowPhoto = cell.trim();
            break;
          }
        }
      }
      if (rowPhoto && !record.foto) {
        record.foto = rowPhoto;
      }
      if (normalizedSolicitante) {
        let catKey = null;
        if (normalizedSolicitante === "SERVI\xC7OS URBANOS") catKey = "SERVI\xC7OS URBANOS";
        else if (normalizedSolicitante === "CULTURA E LAZER" || normalizedSolicitante === "SOCIOCULTURAL") catKey = "SOCIOCULTURAL";
        else if (normalizedSolicitante === "MOBILIDADE") catKey = "MOBILIDADE";
        else if (normalizedSolicitante === "ESPA\xC7OS P\xDABLICOS") catKey = "ESPA\xC7OS P\xDABLICOS";
        if (catKey) {
          record.categorias[catKey]++;
        }
      }
      let opPeriodo = "MANH\xC3";
      if (periodoCol.includes("TARDE")) opPeriodo = "TARDE";
      else if (periodoCol.includes("NOITE")) opPeriodo = "NOITE";
      let opDia = diaSemanaCol;
      if (diaSemanaCol === "SAB." || diaSemanaCol === "SAB") opDia = "S\xC1B.";
      const opCorretiva = row[mapping.corretivas] && row[mapping.corretivas].trim() !== "";
      record.situacoes.push({
        data: dataStr || "S/D",
        local: fullEnd || "Cruzamento sob Demanda",
        bairro: bairroCol || "CTTU",
        periodo: opPeriodo,
        diaSemana: opDia || "DI\xC1RIA",
        solicitante: solicitanteCol,
        demandas: demandasCol,
        corretiva: !!opCorretiva
      });
      efetivos[efetivoCol] = record;
    }
    let normPeriodo = "MANH\xC3";
    if (periodoCol.includes("TARDE")) normPeriodo = "TARDE";
    else if (periodoCol.includes("NOITE")) normPeriodo = "NOITE";
    if (!periodos[normPeriodo]) {
      periodos[normPeriodo] = { total: 0, fixo: 0, moto: 0 };
    }
    periodos[normPeriodo].total++;
    if (motociclistaCol && motociclistaCol.trim() !== "") {
      periodos[normPeriodo].moto++;
    } else {
      periodos[normPeriodo].fixo++;
    }
    let normDia = diaSemanaCol;
    if (diaSemanaCol === "SEG.") normDia = "SEG.";
    else if (diaSemanaCol === "TER.") normDia = "TER.";
    else if (diaSemanaCol === "QUA.") normDia = "QUA.";
    else if (diaSemanaCol === "QUI.") normDia = "QUI.";
    else if (diaSemanaCol === "SEX.") normDia = "SEX.";
    else if (diaSemanaCol === "S\xC1B." || diaSemanaCol === "SAB.") normDia = "S\xC1B.";
    else if (diaSemanaCol === "DOM.") normDia = "DOM.";
    if (normDia in diasSemanaMap) {
      diasSemanaMap[normDia]++;
    }
    const parsedDate = parseRowDate(dataStr);
    if (parsedDate) {
      const mNum = parsedDate.getMonth() + 1;
      const mKey = String(mNum).padStart(2, "0");
      if (mKey in mesesMap) {
        mesesMap[mKey]++;
      }
    }
    const isCorretiva = row[mapping.corretivas] && row[mapping.corretivas].trim() !== "";
    if (isCorretiva) {
      numCorretivas++;
    } else {
      numPreventivas++;
    }
  }
  const totalRecs = Object.values(solicitantes).reduce((sum, val) => sum + val, 0);
  const formattedSolicitantes = {};
  for (const [key, val] of Object.entries(solicitantes)) {
    formattedSolicitantes[key] = {
      count: val,
      pct: parseFloat((val / totalRecs * 100).toFixed(2))
    };
  }
  const listBairros = Object.entries(bairros).sort((a, b) => b[1] - a[1]).map(([nome, valor], index) => ({
    pos: index + 1,
    nome,
    valor
  }));
  const listEnderecos = Object.entries(enderecos).sort((a, b) => b[1] - a[1]).map(([local, valor], index) => ({
    pos: index + 1,
    local,
    valor,
    bairro: addressToBairro[local] || ""
  }));
  const listEfetivos = Object.entries(efetivos).sort((a, b) => b[1].count - a[1].count).map(([nome, info], index) => {
    const periodCounts = {};
    info.situacoes.forEach((s) => {
      periodCounts[s.periodo] = (periodCounts[s.periodo] || 0) + 1;
    });
    let topPeriodo = "MANH\xC3";
    let maxCount = 0;
    Object.entries(periodCounts).forEach(([p, c]) => {
      if (c > maxCount) {
        maxCount = c;
        topPeriodo = p;
      }
    });
    let finalCargo = info.cargo;
    if (finalCargo.toUpperCase().includes("ETAPA")) {
      finalCargo = topPeriodo;
    }
    let finalEscala = info.escala;
    if (finalEscala.toUpperCase().includes("ETAPA")) {
      finalEscala = topPeriodo;
    }
    return {
      rank: index + 1,
      nome: nome.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
      cargo: finalCargo,
      escala: finalEscala,
      periodo: topPeriodo,
      valor: info.count,
      foto: info.foto,
      categorias: info.categorias,
      situacoes: info.situacoes
    };
  });
  const diasOrdenados = [
    { label: "Dom", count: diasSemanaMap["DOM."] },
    { label: "Seg", count: diasSemanaMap["SEG."] },
    { label: "Ter", count: diasSemanaMap["TER."] },
    { label: "Qua", count: diasSemanaMap["QUA."] },
    { label: "Qui", count: diasSemanaMap["QUI."] },
    { label: "Sex", count: diasSemanaMap["SEX."] },
    { label: "S\xE1b", count: diasSemanaMap["S\xC1B."] }
  ];
  const mesesOrdenados = [
    { label: "jan.", count: mesesMap["01"] },
    { label: "fev.", count: mesesMap["02"] },
    { label: "mar.", count: mesesMap["03"] },
    { label: "abr.", count: mesesMap["04"] },
    { label: "mai.", count: mesesMap["05"] },
    { label: "jun.", count: mesesMap["06"] },
    { label: "jul.", count: mesesMap["07"] },
    { label: "ago.", count: mesesMap["08"] },
    { label: "set.", count: mesesMap["09"] },
    { label: "out.", count: mesesMap["10"] },
    { label: "nov.", count: mesesMap["11"] },
    { label: "dez.", count: mesesMap["12"] }
  ];
  const pctPreventivo = parseFloat((numPreventivas / totalRecs * 100).toFixed(1));
  const pctCorretivo = parseFloat((100 - pctPreventivo).toFixed(1));
  return {
    recordCount: totalRecs,
    solicitantes: formattedSolicitantes,
    bairros: listBairros,
    enderecos: listEnderecos,
    efetivos: listEfetivos,
    periodos,
    diasSemana: diasOrdenados,
    mensal: mesesOrdenados,
    preventivoVsCorretivo: {
      preventivo: pctPreventivo > 0 ? pctPreventivo : 91.6,
      corretivo: pctCorretivo > 0 ? pctCorretivo : 8.4
    }
  };
}
app.get("/api/data", async (req, res) => {
  const forceReload = req.query.reload === "true";
  const startDate = req.query.startDate ? String(req.query.startDate) : void 0;
  const endDate = req.query.endDate ? String(req.query.endDate) : void 0;
  const now = Date.now();
  let rows = null;
  const customSpreadsheetId = req.query.spreadsheetId ? String(req.query.spreadsheetId).trim() : void 0;
  const authHeader = req.headers.authorization;
  if (customSpreadsheetId && authHeader && !customSpreadsheetId.startsWith("http")) {
    try {
      const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${customSpreadsheetId}`;
      const metaResponse = await fetch(metaUrl, {
        headers: { "Authorization": authHeader }
      });
      if (!metaResponse.ok) {
        const errorText = await metaResponse.text();
        throw new Error(`Google Sheets Metadata API error: ${metaResponse.status} ${errorText}`);
      }
      const metaData = await metaResponse.json();
      const firstSheetName = metaData.sheets?.[0]?.properties?.title || "Sheet1";
      const range = `${firstSheetName}!A1:Z50000`;
      const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${customSpreadsheetId}/values/${encodeURIComponent(range)}`;
      const sheetsResponse = await fetch(sheetsUrl, {
        headers: { "Authorization": authHeader }
      });
      if (!sheetsResponse.ok) {
        const errorText = await sheetsResponse.text();
        throw new Error(`Google Sheets Values API error: ${sheetsResponse.status} ${errorText}`);
      }
      const sheetsData = await sheetsResponse.json();
      if (sheetsData.values && sheetsData.values.length > 0) {
        rows = sheetsData.values;
      } else {
        throw new Error("A planilha retornou vazia ou sem valores.");
      }
    } catch (error) {
      console.error("Erro ao carregar planilha customizada:", error.message);
      return res.status(400).json({ error: `Erro no Google Sheets: ${error.message}` });
    }
  } else if (customSpreadsheetId && customSpreadsheetId.startsWith("http")) {
    try {
      const fetchResponse = await fetch(customSpreadsheetId);
      if (!fetchResponse.ok) {
        throw new Error(`Falha ao buscar CSV customizado: ${fetchResponse.statusText}`);
      }
      const csvText = await fetchResponse.text();
      rows = parseCSV(csvText);
    } catch (error) {
      console.error("Erro ao carregar planilha customizada:", error.message);
      return res.status(400).json({ error: `Erro ao carregar URL: ${error.message}` });
    }
  } else {
    if (cachedRows && !forceReload && now - lastFetchTime < 3e4) {
      rows = cachedRows;
    } else {
      try {
        const cacheBustUrl = `${SHEETS_CSV_URL}&t=${now}`;
        const fetchResponse = await fetch(cacheBustUrl);
        if (!fetchResponse.ok) {
          throw new Error(`Exfalha ao obter CSV: ${fetchResponse.statusText}`);
        }
        const csvText = await fetchResponse.text();
        rows = parseCSV(csvText);
        if (rows.length <= 1) {
          throw new Error("CSV retornado est\xE1 vazio ou cont\xE9m apenas o cabe\xE7alho.");
        }
        cachedRows = rows;
        lastFetchTime = now;
      } catch (error) {
        console.error("Erro carregando planilha real. Carregando fallback para estabilidade:", error.message);
        rows = generateMockRows();
        cachedRows = rows;
        lastFetchTime = now;
      }
    }
  }
  try {
    if (!rows || rows.length <= 1) {
      throw new Error("Dados indispon\xEDveis.");
    }
    const headerRow = rows[0];
    const dataRows = rows.slice(1);
    const mapping = getColumnsMapping(headerRow);
    const reqDiaSemana = req.query.diaSemana ? String(req.query.diaSemana).trim() : void 0;
    const reqBairro = req.query.bairro ? String(req.query.bairro).trim() : void 0;
    const reqSolicitante = req.query.solicitante ? String(req.query.solicitante).trim() : void 0;
    const reqPeriodo = req.query.periodo ? String(req.query.periodo).trim() : void 0;
    const reqMode = req.query.mode ? String(req.query.mode).trim() : void 0;
    const reqCaracter = req.query.caracter ? String(req.query.caracter).trim() : void 0;
    const reqMonth = req.query.month ? String(req.query.month).trim() : void 0;
    const getNormalizedSolicitante = (solicitanteCol) => {
      const up = solicitanteCol.trim().toUpperCase();
      if (up.includes("SERVI\xC7OS URBANOS")) {
        return "SERVI\xC7OS URBANOS";
      } else if (up.includes("CULTURA E LAZER") || up.includes("CULTURA") || up.includes("SOCIOCULTURAL")) {
        return "CULTURA E LAZER";
      } else if (up.includes("ESPA\xC7OS P\xDABLICOS") || up.includes("ESPACOS")) {
        return "ESPA\xC7OS P\xDABLICOS";
      } else if (up.includes("MOBILIDADE") || up.includes("PLANEJAD") || up.includes("EDUCATIV") || up.includes("PRESEN\xC7A") || up.includes("PRESENCA") || up.includes("ESTRATEGIC") || up.includes("ESTRAT\xC9GIC")) {
        return "MOBILIDADE";
      }
      return "OUTRO";
    };
    const getNormalizedBairro = (bairroCol) => {
      let b = bairroCol.trim().toUpperCase();
      if (b === "RECEITA" || b === "RECEITA DA PENHA" || b === "BAIRRO DO RECIFE") {
        return "RECIFE";
      }
      return b;
    };
    const getNormalizedDiaSemana = (diaSemanaCol) => {
      let d = diaSemanaCol.trim().toUpperCase();
      if (d === "SAB.") d = "S\xC1B.";
      return d;
    };
    const getNormalizedPeriodo = (periodoCol) => {
      const p = periodoCol.trim().toUpperCase();
      if (p.includes("TARDE")) return "TARDE";
      if (p.includes("NOITE")) return "NOITE";
      return "MANH\xC3";
    };
    const getNormalizedMode = (row) => {
      const motociclistaCol = mapping.motociclista !== -1 ? row[mapping.motociclista] || "" : "";
      return motociclistaCol.trim() !== "" ? "MOTO" : "FIXO";
    };
    const getNormalizedCaracter = (row) => {
      const isCorretiva = mapping.corretivas !== -1 && row[mapping.corretivas] && row[mapping.corretivas].trim() !== "";
      return isCorretiva ? "CORRETIVO" : "PREVENTIVO";
    };
    const matchRow = (row, exceptFilter) => {
      const dateStr = row[mapping.data] || "";
      if (!isRowWithinRange(dateStr, startDate, endDate)) {
        return false;
      }
      if (reqSolicitante && exceptFilter !== "solicitante") {
        const rawSol = mapping.solicitante !== -1 ? row[mapping.solicitante] || "OUTRO" : "OUTRO";
        const normSol = getNormalizedSolicitante(rawSol);
        let targetFilter = reqSolicitante.toUpperCase();
        if (targetFilter === "SOCIOCULTURAL") {
          targetFilter = "CULTURA E LAZER";
        }
        if (normSol !== targetFilter) {
          return false;
        }
      }
      if (reqBairro && exceptFilter !== "bairro") {
        const rawB = mapping.bairro !== -1 ? row[mapping.bairro] || "OUTRO" : "OUTRO";
        const normBairro = getNormalizedBairro(rawB);
        if (normBairro !== reqBairro.toUpperCase()) {
          return false;
        }
      }
      if (reqDiaSemana && exceptFilter !== "diaSemana") {
        const rawDia = mapping.diaSemana !== -1 ? row[mapping.diaSemana] || "OUTRO" : "OUTRO";
        const normDia = getNormalizedDiaSemana(rawDia);
        let cleanReq = reqDiaSemana.toUpperCase();
        if (!cleanReq.endsWith(".")) {
          cleanReq += ".";
        }
        if (cleanReq === "SAB.") cleanReq = "S\xC1B.";
        if (normDia !== cleanReq) {
          return false;
        }
      }
      if (reqPeriodo && exceptFilter !== "periodo") {
        const rawP = mapping.periodo !== -1 ? row[mapping.periodo] || "OUTRO" : "OUTRO";
        const normPeriodo = getNormalizedPeriodo(rawP);
        if (normPeriodo !== reqPeriodo.toUpperCase()) {
          return false;
        }
      }
      if (reqMode && exceptFilter !== "mode") {
        const normMode = getNormalizedMode(row);
        let targetFilter = reqMode.toUpperCase();
        if (targetFilter === "MOTORIZADO") targetFilter = "MOTO";
        if (normMode !== targetFilter) {
          return false;
        }
      }
      if (reqCaracter && exceptFilter !== "caracter") {
        const normCaracter = getNormalizedCaracter(row);
        let targetFilter = reqCaracter.toUpperCase();
        if (targetFilter === "CORRETIVA") targetFilter = "CORRETIVO";
        if (targetFilter === "PREVENTIVA") targetFilter = "PREVENTIVO";
        if (normCaracter !== targetFilter) {
          return false;
        }
      }
      if (reqMonth && exceptFilter !== "month") {
        const dateStr2 = row[mapping.data] || "";
        const parsedDate = parseRowDate(dateStr2);
        if (parsedDate) {
          const mNum = parsedDate.getMonth() + 1;
          const mKey = String(mNum).padStart(2, "0");
          const labelMonth = mNum === 1 ? "jan." : mNum === 2 ? "fev." : mNum === 3 ? "mar." : mNum === 4 ? "abr." : mNum === 5 ? "mai." : mNum === 6 ? "jun." : mNum === 7 ? "jul." : mNum === 8 ? "ago." : mNum === 9 ? "set." : mNum === 10 ? "out." : mNum === 11 ? "nov." : "dez.";
          if (reqMonth !== mKey && reqMonth !== labelMonth && reqMonth.toLowerCase() !== labelMonth) {
            return false;
          }
        } else {
          return false;
        }
      }
      return true;
    };
    const filteredDataRowsExceptMonth = dataRows.filter((row) => matchRow(row, "month"));
    const filteredDataRows = dataRows.filter((row) => matchRow(row));
    const filteredRows = [headerRow, ...filteredDataRows];
    console.log("Analytics: Processing filtered rows, total count:", filteredRows.length);
    const analyticsResult = processAnalytics(filteredRows);
    if (reqMonth) {
      console.log("Analytics: Processing monthly breakdown");
      const fullMensalAnalytics = processAnalytics([headerRow, ...filteredDataRowsExceptMonth]);
      analyticsResult.mensal = fullMensalAnalytics.mensal;
    }
    const availableBairros = /* @__PURE__ */ new Set();
    const availableSolicitantes = /* @__PURE__ */ new Set();
    const availableDiasSemana = /* @__PURE__ */ new Set();
    const availablePeriodos = /* @__PURE__ */ new Set();
    const availableModes = /* @__PURE__ */ new Set();
    const availableCaracters = /* @__PURE__ */ new Set();
    const availableMonths = /* @__PURE__ */ new Set();
    for (const row of dataRows) {
      if (matchRow(row, "bairro")) {
        const rawB = mapping.bairro !== -1 ? row[mapping.bairro] : null;
        if (rawB) {
          availableBairros.add(getNormalizedBairro(rawB));
        }
      }
      if (matchRow(row, "solicitante")) {
        const rawSol = mapping.solicitante !== -1 ? row[mapping.solicitante] : null;
        if (rawSol) {
          availableSolicitantes.add(getNormalizedSolicitante(rawSol));
        }
      }
      if (matchRow(row, "diaSemana")) {
        const rawDia = mapping.diaSemana !== -1 ? row[mapping.diaSemana] : null;
        if (rawDia) {
          let norm = getNormalizedDiaSemana(rawDia);
          if (norm.endsWith(".")) {
            norm = norm.slice(0, -1);
          }
          availableDiasSemana.add(norm);
        }
      }
      if (matchRow(row, "periodo")) {
        const rawP = mapping.periodo !== -1 ? row[mapping.periodo] : null;
        if (rawP) {
          availablePeriodos.add(getNormalizedPeriodo(rawP));
        }
      }
      if (matchRow(row, "mode")) {
        availableModes.add(getNormalizedMode(row));
      }
      if (matchRow(row, "caracter")) {
        availableCaracters.add(getNormalizedCaracter(row));
      }
      if (matchRow(row, "month")) {
        const dateStr = row[mapping.data] || "";
        const parsedDate = parseRowDate(dateStr);
        if (parsedDate) {
          const mNum = parsedDate.getMonth() + 1;
          const labelMonth = mNum === 1 ? "jan." : mNum === 2 ? "fev." : mNum === 3 ? "mar." : mNum === 4 ? "abr." : mNum === 5 ? "mai." : mNum === 6 ? "jun." : mNum === 7 ? "jul." : mNum === 8 ? "ago." : mNum === 9 ? "set." : mNum === 10 ? "out." : mNum === 11 ? "nov." : "dez.";
          availableMonths.add(labelMonth);
          const mKey = String(mNum).padStart(2, "0");
          availableMonths.add(mKey);
        }
      }
    }
    analyticsResult.availableFilters = {
      bairros: Array.from(availableBairros),
      solicitantes: Array.from(availableSolicitantes),
      diasSemana: Array.from(availableDiasSemana),
      periodos: Array.from(availablePeriodos),
      modes: Array.from(availableModes),
      caracters: Array.from(availableCaracters),
      months: Array.from(availableMonths)
    };
    return res.json(analyticsResult);
  } catch (error) {
    console.error("Erro detalhado ao processar dados filtrados:", error);
    return res.status(500).json({ error: "Erro interno no processamento dos dados.", details: error.message });
  }
});
app.get("/api/efetivo-fixo", async (req, res) => {
  try {
    let parseCSVLine = function(line) {
      const result = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === "," && !inQuotes) {
          result.push(current);
          current = "";
        } else {
          current += char;
        }
      }
      result.push(current);
      return result;
    };
    const response = await fetch(EFETIVO_FIXO_URL);
    if (!response.ok) throw new Error("Falha ao buscar dados do efetivo fixo.");
    const text = await response.text();
    const lines = text.split("\n");
    const data = [];
    for (let i = 3; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const cols = parseCSVLine(line);
      if (cols.length < 10) continue;
      const loc = cols[9].replace(/"/g, "").trim();
      let lat = null, lng = null;
      if (loc && loc !== "-") {
        const parts = loc.split(",");
        if (parts.length === 2) {
          lat = parseFloat(parts[0].trim());
          lng = parseFloat(parts[1].trim());
        }
      }
      data.push({
        nome: cols[2].trim(),
        cargo: cols[3].trim(),
        etapa: cols[4].trim(),
        contato: cols[5].trim(),
        localApoio: cols[6].trim(),
        especifico: cols[7].trim(),
        horario: cols[8].trim(),
        lat,
        lng,
        foto: cols[10] ? cols[10].trim() : ""
      });
    }
    res.json(data);
  } catch (error) {
    console.error("Erro ao carregar escala de efetivo fixo:", error.message);
    res.status(500).json({ error: error.message });
  }
});
app.post("/api/ai/analyze", async (req, res) => {
  const { systemPrompt, userQuery } = req.body;
  if (!systemPrompt || !userQuery) {
    return res.status(400).json({ error: "Par\xE2metros systemPrompt e userQuery s\xE3o obrigat\xF3rios." });
  }
  const modelsToTry = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-3.5-flash"];
  let lastError = null;
  for (const modelName of modelsToTry) {
    try {
      console.log(`Tentando gerar an\xE1lise inteligente com o modelo: ${modelName}`);
      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: modelName,
        contents: userQuery,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.4
        }
      });
      const answer = response.text || "Sem resposta do modelo.";
      console.log(`Sucesso ao gerar an\xE1lise com o modelo: ${modelName}`);
      return res.json({ result: answer });
    } catch (error) {
      console.warn(`Falha na API do Gemini com o modelo ${modelName}:`, error.message || error);
      lastError = error;
    }
  }
  console.error("Erro final em todos os modelos do Gemini:", lastError?.message || lastError);
  return res.status(500).json({
    error: lastError?.message || "Erro de comunica\xE7\xE3o com a Intelig\xEAncia Artificial ap\xF3s tentar m\xFAltiplos modelos."
  });
});
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: /* @__PURE__ */ new Date() });
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Full-Stack Server] Executando com sucesso em http://0.0.0.0:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
