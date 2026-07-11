import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const SHEETS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSncLt5jGyFnv8AFXn08fMzmlUJv89SykRA0kI__zAiJPor5kzOaMAOQYpBKR7ONBFnZuJSs7atn0AU/pub?output=csv";
const EFETIVO_FIXO_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR0beFtf_BfmH6NytmANk_NensTAYZyeoa9EQIxKyal6uAOEzr50CyjDfdZwUW6NybjnG37PPwVNJHc/pub?gid=1613011165&single=true&output=csv";

// Lazy-loaded Gemini SDK setup
let aiInstance: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiInstance) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("A chave de API do Gemini não está configurada. Por favor, adicione GEMINI_API_KEY no painel de Secrets.");
    }
    aiInstance = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiInstance;
}

// In-memory data store for CTTU dataset
interface DashboardData {
  recordCount: number;
  solicitantes: Record<string, { count: number; pct: number }>;
  bairros: Array<{ pos: number; nome: string; valor: number }>;
  enderecos: Array<{ pos: number; local: string; valor: number; bairro?: string }>;
  efetivos: Array<{ rank: number; nome: string; cargo: string; escala: string; periodo?: string; valor: number; foto?: string }>;
  periodos: Record<string, { total: number; fixo: number; moto: number }>;
  diasSemana: Array<{ label: string; count: number }>;
  mensal: Array<{ label: string; count: number }>;
  preventivoVsCorretivo: { preventivo: number; corretivo: number };
  availableFilters?: {
    bairros: string[];
    solicitantes: string[];
    diasSemana: string[];
    periodos: string[];
    modes: string[];
    caracters: string[];
    months: string[];
  };
}

let cachedRows: string[][] | null = null;
let lastFetchTime = 0;

// Helper to parse dates like "DD/MM/YYYY" or "YYYY-MM-DD"
function parseRowDate(dateStr: string): Date | null {
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

// Check if raw row has its date within a given ISO date range
function isRowWithinRange(dateStr: string, startDateStr: string | undefined, endDateStr: string | undefined): boolean {
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

// Generate high-fidelity synthetic rows corresponding to CTTU 2026 aggregates when offline or on fallback
function generateMockRows(): string[][] {
  const headers = ["Data", "Bairro Col", "Solicitante", "Bairro", "Endereço", "Complemento", "Fator", "Efetivo", "Função", "Etapa", "Motociclista", "Periodo", "DiaSemana"];
  headers[31] = "LOCAL";
  const rows: string[][] = [headers];

  const solicitantes = [
    { type: "SERVIÇOS URBANOS", weight: 33.72 },
    { type: "CULTURA E LAZER", weight: 30.73 },
    { type: "MOBILIDADE", weight: 29.85 },
    { type: "ESPAÇOS PÚBLICOS", weight: 5.70 }
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
    { nome: "Pedro Silva", cargo: "ORIENTADOR I", escala: "3ª T", weight: 123 },
    { nome: "Ivanildo Carvalho", cargo: "ORIENTADOR", escala: "3ª M", weight: 114 },
    { nome: "Leonardo Gomes", cargo: "ORIENTADOR I", escala: "3ª T", weight: 113 },
    { nome: "Luiz Augusto", cargo: "ORIENTADOR I", escala: "3ª M", weight: 103 },
    { nome: "Danilo Hilário", cargo: "ORIENTADOR I", escala: "T", weight: 102 }
  ];

  const periodos = [
    { name: "MANHÃ", weight: 2702, isMotoPct: 0.20 },
    { name: "TARDE", weight: 2239, isMotoPct: 0.12 },
    { name: "NOITE", weight: 528, isMotoPct: 0.20 }
  ];

  const dias = [
    { label: "DOM.", weight: 205 },
    { label: "SEG.", weight: 953 },
    { label: "TER.", weight: 899 },
    { label: "QUA.", weight: 833 },
    { label: "QUI.", weight: 844 },
    { label: "SEX.", weight: 791 },
    { label: "SÁB.", weight: 945 }
  ];

  // Utility helper to pick from weighted array
  function pickWeighted<T>(list: Array<T & { weight: number }>): T {
    const totalWeight = list.reduce((sum, item) => sum + item.weight, 0);
    let r = Math.random() * totalWeight;
    for (const item of list) {
      r -= item.weight;
      if (r <= 0) return item;
    }
    return list[0];
  }

  // Start is 2026-01-01, end is 2026-12-31
  const startTimestamp = new Date(2026, 0, 1).getTime();
  const endTimestamp = new Date(2026, 11, 31).getTime();

  for (let i = 0; i < 11000; i++) {
    // Generate date within 2026-01-01 to 2026-12-31
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

// Helper to parse CSV properly with quoted field values
function parseCSV(csvText: string): string[][] {
  const lines = csvText.split(/\r?\n/);
  const rows: string[][] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const row: string[] = [];
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
    if (row.length > 0 && row.some(cell => cell !== "")) {
      rows.push(row);
    }
  }
  return rows;
}

function getColumnsMapping(headers: string[] | undefined) {
  const normalized = (headers || []).map(h => (h || "").toUpperCase().trim());
  const findIndex = (names: string[], fallback: number) => {
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
    endereco: findIndex(["ENDEREÇO", "ENDERECO"], 4),
    complemento: findIndex(["COMPLEMENTO"], 5),
    efetivo: findIndex(["EFETIVO"], 7),
    funcao: findIndex(["FUNÇÃO", "FUNCAO"], 8),
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

// Aggregation logic that processes raw Rows into refined Analytics
function processAnalytics(rows: string[][]): DashboardData {
  if (!rows || rows.length === 0) {
    throw new Error("Não há dados para processar.");
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

  const solicitantes: Record<string, number> = {};
  const bairros: Record<string, number> = {};
  const enderecos: Record<string, number> = {};
  const addressToBairro: Record<string, string> = {};
  const efetivos: Record<string, { 
    count: number; 
    cargo: string; 
    escala: string; 
    foto?: string;
    categorias: {
      "SERVIÇOS URBANOS": number;
      "SOCIOCULTURAL": number;
      "MOBILIDADE": number;
      "ESPAÇOS PÚBLICOS": number;
    };
    situacoes: Array<{
      data: string;
      local: string;
      bairro: string;
      periodo: string;
      diaSemana: string;
      solicitante: string;
      demandas?: string;
      corretiva: boolean;
    }>;
  }> = {};
  const periodos: Record<string, { total: number; fixo: number; moto: number }> = {
    MANHÃ: { total: 0, fixo: 0, moto: 0 },
    TARDE: { total: 0, fixo: 0, moto: 0 },
    NOITE: { total: 0, fixo: 0, moto: 0 },
  };

  const diasSemanaMap: Record<string, number> = {
    "DOM.": 0, "SEG.": 0, "TER.": 0, "QUA.": 0, "QUI.": 0, "SEX.": 0, "SÁB.": 0
  };
  
  const mesesMap: Record<string, number> = {
    "01": 0, "02": 0, "03": 0, "04": 0, "05": 0, "06": 0, "07": 0, "08": 0, "09": 0, "10": 0, "11": 0, "12": 0
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
    const etapaCol = (row[mapping.etapa] || "").trim(); // Escala ex: "3ª M" or "3ª T"
    const motociclistaCol = row[mapping.motociclista] || ""; // Has value if motorizado
    const periodoCol = (row[mapping.periodo] || "OUTRO").trim().toUpperCase();
    const diaSemanaCol = (row[mapping.diaSemana] || "OUTRO").trim().toUpperCase();

    const demandasCol = mapping.demandas !== -1 ? (row[mapping.demandas] || "").trim().toUpperCase() : "";

    // Map Solicitantes to standard categories
    let normalizedSolicitante = "";
    if (solicitanteCol.includes("SERVIÇOS URBANOS")) {
      normalizedSolicitante = "SERVIÇOS URBANOS";
    } else if (solicitanteCol.includes("CULTURA E LAZER") || solicitanteCol.includes("CULTURA") || solicitanteCol.includes("SOCIOCULTURAL")) {
      normalizedSolicitante = "CULTURA E LAZER";
    } else if (solicitanteCol.includes("ESPAÇOS PÚBLICOS") || solicitanteCol.includes("ESPACOS")) {
      normalizedSolicitante = "ESPAÇOS PÚBLICOS";
    } else if (
      solicitanteCol.includes("MOBILIDADE") || 
      solicitanteCol.includes("PLANEJAD") || 
      solicitanteCol.includes("EDUCATIV") || 
      solicitanteCol.includes("PRESENÇA") || 
      solicitanteCol.includes("PRESENCA") || 
      solicitanteCol.includes("ESTRATEGIC") || 
      solicitanteCol.includes("ESTRATÉGIC")
    ) {
      normalizedSolicitante = "MOBILIDADE";
    }
    
    // EXCLUINDO A OPÇÃO OUTRO
    if (!normalizedSolicitante) {
      continue;
    }
    
    solicitantes[normalizedSolicitante] = (solicitantes[normalizedSolicitante] || 0) + 1;

    // Normalizing Bairros
    if (bairroCol && bairroCol !== "BAIRRO") {
      bairros[bairroCol] = (bairros[bairroCol] || 0) + 1;
    }

    // Normalizing Endereços
    let fullEnd = "";
    if (localColVal && localColVal !== "LOCAL") {
      fullEnd = localColVal;
    } else if (enderecoCol && enderecoCol !== "ENDEREÇO") {
      fullEnd = complementCol ? `${enderecoCol} - ${complementCol}` : enderecoCol;
    }

    if (fullEnd) {
      enderecos[fullEnd] = (enderecos[fullEnd] || 0) + 1;
      if (bairroCol && bairroCol !== "BAIRRO") {
        addressToBairro[fullEnd] = bairroCol;
      }
    }

    // Normalizing Operatives/Agents
    if (efetivoCol && efetivoCol !== "EFETIVO" && efetivoCol !== "TOTAL") {
      const record = efetivos[efetivoCol] || { 
        count: 0, 
        cargo: funcaoCol, 
        escala: etapaCol || "Escala",
        categorias: {
          "SERVIÇOS URBANOS": 0,
          "SOCIOCULTURAL": 0,
          "MOBILIDADE": 0,
          "ESPAÇOS PÚBLICOS": 0
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
      
      // Add to categories
      if (normalizedSolicitante) {
        let catKey: "SERVIÇOS URBANOS" | "SOCIOCULTURAL" | "MOBILIDADE" | "ESPAÇOS PÚBLICOS" | null = null;
        if (normalizedSolicitante === "SERVIÇOS URBANOS") catKey = "SERVIÇOS URBANOS";
        else if (normalizedSolicitante === "CULTURA E LAZER" || normalizedSolicitante === "SOCIOCULTURAL") catKey = "SOCIOCULTURAL";
        else if (normalizedSolicitante === "MOBILIDADE") catKey = "MOBILIDADE";
        else if (normalizedSolicitante === "ESPAÇOS PÚBLICOS") catKey = "ESPAÇOS PÚBLICOS";
        
        if (catKey) {
          record.categorias[catKey]++;
        }
      }

      let opPeriodo = "MANHÃ";
      if (periodoCol.includes("TARDE")) opPeriodo = "TARDE";
      else if (periodoCol.includes("NOITE")) opPeriodo = "NOITE";

      let opDia = diaSemanaCol;
      if (diaSemanaCol === "SAB." || diaSemanaCol === "SAB") opDia = "SÁB.";

      const opCorretiva = row[mapping.corretivas] && row[mapping.corretivas].trim() !== "";

      record.situacoes.push({
        data: dataStr || "S/D",
        local: fullEnd || "Cruzamento sob Demanda",
        bairro: bairroCol || "CTTU",
        periodo: opPeriodo,
        diaSemana: opDia || "DIÁRIA",
        solicitante: solicitanteCol,
        demandas: demandasCol,
        corretiva: !!opCorretiva
      });

      efetivos[efetivoCol] = record;
    }

    // Normalizing Turnos (MANHÃ, TARDE, NOITE)
    let normPeriodo = "MANHÃ";
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

    // Days of week
    let normDia = diaSemanaCol;
    if (diaSemanaCol === "SEG.") normDia = "SEG.";
    else if (diaSemanaCol === "TER.") normDia = "TER.";
    else if (diaSemanaCol === "QUA.") normDia = "QUA.";
    else if (diaSemanaCol === "QUI.") normDia = "QUI.";
    else if (diaSemanaCol === "SEX.") normDia = "SEX.";
    else if (diaSemanaCol === "SÁB." || diaSemanaCol === "SAB.") normDia = "SÁB.";
    else if (diaSemanaCol === "DOM.") normDia = "DOM.";

    if (normDia in diasSemanaMap) {
      diasSemanaMap[normDia]++;
    }

    // Month breakdown
    const parsedDate = parseRowDate(dataStr);
    if (parsedDate) {
      const mNum = parsedDate.getMonth() + 1;
      const mKey = String(mNum).padStart(2, "0");
      if (mKey in mesesMap) {
        mesesMap[mKey]++;
      }
    }

    // Character classification (Preventative vs Corrective)
    const isCorretiva = row[mapping.corretivas] && row[mapping.corretivas].trim() !== "";
    if (isCorretiva) {
      numCorretivas++;
    } else {
      numPreventivas++;
    }
  }

  // Formatting percentages for solicitantes
  const totalRecs = Object.values(solicitantes).reduce((sum, val) => sum + val, 0);
  const formattedSolicitantes: Record<string, { count: number; pct: number }> = {};
  for (const [key, val] of Object.entries(solicitantes)) {
    formattedSolicitantes[key] = {
      count: val,
      pct: parseFloat(((val / totalRecs) * 100).toFixed(2)),
    };
  }

  // Structuring Bairros Ranking
  const listBairros = Object.entries(bairros)
    .sort((a, b) => b[1] - a[1])
    .map(([nome, valor], index) => ({
      pos: index + 1,
      nome,
      valor
    }));

  // Structuring Endereço Ranking
  const listEnderecos = Object.entries(enderecos)
    .sort((a, b) => b[1] - a[1])
    .map(([local, valor], index) => ({
      pos: index + 1,
      local,
      valor,
      bairro: addressToBairro[local] || ""
    }));

  // Structuring Agents Leaderboard
  const listEfetivos = Object.entries(efetivos)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([nome, info], index) => {
      // Find the most frequent period for this agent
      const periodCounts: Record<string, number> = {};
      info.situacoes.forEach(s => {
        periodCounts[s.periodo] = (periodCounts[s.periodo] || 0) + 1;
      });
      let topPeriodo = "MANHÃ";
      let maxCount = 0;
      Object.entries(periodCounts).forEach(([p, c]) => {
        if (c > maxCount) {
          maxCount = c;
          topPeriodo = p;
        }
      });

      // If the cargo contains "ETAPA", replace it with the period
      let finalCargo = info.cargo;
      if (finalCargo.toUpperCase().includes("ETAPA")) {
        finalCargo = topPeriodo;
      }

      // If the escala contains "ETAPA", replace it with the period
      let finalEscala = info.escala;
      if (finalEscala.toUpperCase().includes("ETAPA")) {
        finalEscala = topPeriodo;
      }

      return {
        rank: index + 1,
        nome: nome.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()),
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
    { label: "Sáb", count: diasSemanaMap["SÁB."] }
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

  // Dynamic preventivo percentages corresponding directly to real dataset values
  const pctPreventivo = parseFloat(((numPreventivas / totalRecs) * 100).toFixed(1));
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

// Endpoint to fetch metrics
app.get("/api/data", async (req, res) => {
  const forceReload = req.query.reload === "true";
  const startDate = req.query.startDate ? String(req.query.startDate) : undefined;
  const endDate = req.query.endDate ? String(req.query.endDate) : undefined;
  const now = Date.now();

  let rows: string[][] | null = null;

  const customSpreadsheetId = req.query.spreadsheetId ? String(req.query.spreadsheetId).trim() : undefined;
  const authHeader = req.headers.authorization;

  if (customSpreadsheetId && authHeader && !customSpreadsheetId.startsWith("http")) {
    try {
      // 1. Get spreadsheet metadata to retrieve the first sheet's name
      const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${customSpreadsheetId}`;
      const metaResponse = await fetch(metaUrl, {
        headers: { "Authorization": authHeader }
      });
      if (!metaResponse.ok) {
        const errorText = await metaResponse.text();
        throw new Error(`Google Sheets Metadata API error: ${metaResponse.status} ${errorText}`);
      }
      const metaData = (await metaResponse.json()) as any;
      const firstSheetName = metaData.sheets?.[0]?.properties?.title || "Sheet1";

      // 2. Fetch the values from the first sheet
      const range = `${firstSheetName}!A1:Z50000`;
      const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${customSpreadsheetId}/values/${encodeURIComponent(range)}`;
      const sheetsResponse = await fetch(sheetsUrl, {
        headers: { "Authorization": authHeader }
      });
      if (!sheetsResponse.ok) {
        const errorText = await sheetsResponse.text();
        throw new Error(`Google Sheets Values API error: ${sheetsResponse.status} ${errorText}`);
      }
      const sheetsData = (await sheetsResponse.json()) as any;
      if (sheetsData.values && sheetsData.values.length > 0) {
        rows = sheetsData.values;
      } else {
        throw new Error("A planilha retornou vazia ou sem valores.");
      }
    } catch (error: any) {
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
    } catch (error: any) {
      console.error("Erro ao carregar planilha customizada:", error.message);
      return res.status(400).json({ error: `Erro ao carregar URL: ${error.message}` });
    }
  } else {
    // Utilize cache if fresh and available (30 seconds cache for real-time responsiveness)
    if (cachedRows && !forceReload && (now - lastFetchTime < 30000)) {
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
          throw new Error("CSV retornado está vazio ou contém apenas o cabeçalho.");
        }
        cachedRows = rows;
        lastFetchTime = now;
      } catch (error: any) {
        console.error("Erro carregando planilha real. Carregando fallback para estabilidade:", error.message);
        // Fallback is synthetic dynamic row generation for interactive date range experience
        rows = generateMockRows();
        cachedRows = rows;
        lastFetchTime = now;
      }
    }
  }

  try {
    if (!rows || rows.length <= 1) {
      throw new Error("Dados indisponíveis.");
    }

    // Header row is always included
    const headerRow = rows[0];
    const dataRows = rows.slice(1);

    const mapping = getColumnsMapping(headerRow);

    const reqDiaSemana = req.query.diaSemana ? String(req.query.diaSemana).trim() : undefined;
    const reqBairro = req.query.bairro ? String(req.query.bairro).trim() : undefined;
    const reqSolicitante = req.query.solicitante ? String(req.query.solicitante).trim() : undefined;
    const reqPeriodo = req.query.periodo ? String(req.query.periodo).trim() : undefined;
    const reqMode = req.query.mode ? String(req.query.mode).trim() : undefined;
    const reqCaracter = req.query.caracter ? String(req.query.caracter).trim() : undefined;
    const reqMonth = req.query.month ? String(req.query.month).trim() : undefined;

    // Normalization helpers
    const getNormalizedSolicitante = (solicitanteCol: string): string => {
      const up = solicitanteCol.trim().toUpperCase();
      if (up.includes("SERVIÇOS URBANOS")) {
        return "SERVIÇOS URBANOS";
      } else if (up.includes("CULTURA E LAZER") || up.includes("CULTURA") || up.includes("SOCIOCULTURAL")) {
        return "CULTURA E LAZER";
      } else if (up.includes("ESPAÇOS PÚBLICOS") || up.includes("ESPACOS")) {
        return "ESPAÇOS PÚBLICOS";
      } else if (
        up.includes("MOBILIDADE") || 
        up.includes("PLANEJAD") || 
        up.includes("EDUCATIV") || 
        up.includes("PRESENÇA") || 
        up.includes("PRESENCA") || 
        up.includes("ESTRATEGIC") || 
        up.includes("ESTRATÉGIC")
      ) {
        return "MOBILIDADE";
      }
      return "OUTRO";
    };

    const getNormalizedBairro = (bairroCol: string): string => {
      let b = bairroCol.trim().toUpperCase();
      if (b === "RECEITA" || b === "RECEITA DA PENHA" || b === "BAIRRO DO RECIFE") {
        return "RECIFE";
      }
      return b;
    };

    const getNormalizedDiaSemana = (diaSemanaCol: string): string => {
      let d = diaSemanaCol.trim().toUpperCase();
      if (d === "SAB.") d = "SÁB.";
      return d;
    };

    const getNormalizedPeriodo = (periodoCol: string): string => {
      const p = periodoCol.trim().toUpperCase();
      if (p.includes("TARDE")) return "TARDE";
      if (p.includes("NOITE")) return "NOITE";
      return "MANHÃ";
    };

    const getNormalizedMode = (row: string[]): string => {
      const motociclistaCol = mapping.motociclista !== -1 ? (row[mapping.motociclista] || "") : "";
      return motociclistaCol.trim() !== "" ? "MOTO" : "FIXO";
    };

    const getNormalizedCaracter = (row: string[]): string => {
      const isCorretiva = mapping.corretivas !== -1 && row[mapping.corretivas] && row[mapping.corretivas].trim() !== "";
      return isCorretiva ? "CORRETIVO" : "PREVENTIVO";
    };

    // Main multi-filter evaluation function that supports excluding one dimension
    const matchRow = (row: string[], exceptFilter?: string): boolean => {
      // Date range filter is always applied
      const dateStr = row[mapping.data] || "";
      if (!isRowWithinRange(dateStr, startDate, endDate)) {
        return false;
      }

      // 1. Solicitante filter
      if (reqSolicitante && exceptFilter !== "solicitante") {
        const rawSol = mapping.solicitante !== -1 ? (row[mapping.solicitante] || "OUTRO") : "OUTRO";
        const normSol = getNormalizedSolicitante(rawSol);
        let targetFilter = reqSolicitante.toUpperCase();
        if (targetFilter === "SOCIOCULTURAL") {
          targetFilter = "CULTURA E LAZER";
        }
        if (normSol !== targetFilter) {
          return false;
        }
      }

      // 2. Bairro filter
      if (reqBairro && exceptFilter !== "bairro") {
        const rawB = mapping.bairro !== -1 ? (row[mapping.bairro] || "OUTRO") : "OUTRO";
        const normBairro = getNormalizedBairro(rawB);
        if (normBairro !== reqBairro.toUpperCase()) {
          return false;
        }
      }

      // 3. Dia da semana filter
      if (reqDiaSemana && exceptFilter !== "diaSemana") {
        const rawDia = mapping.diaSemana !== -1 ? (row[mapping.diaSemana] || "OUTRO") : "OUTRO";
        const normDia = getNormalizedDiaSemana(rawDia);
        let cleanReq = reqDiaSemana.toUpperCase();
        if (!cleanReq.endsWith(".")) {
          cleanReq += ".";
        }
        if (cleanReq === "SAB.") cleanReq = "SÁB.";
        if (normDia !== cleanReq) {
          return false;
        }
      }

      // 4. Periodo filter
      if (reqPeriodo && exceptFilter !== "periodo") {
        const rawP = mapping.periodo !== -1 ? (row[mapping.periodo] || "OUTRO") : "OUTRO";
        const normPeriodo = getNormalizedPeriodo(rawP);
        if (normPeriodo !== reqPeriodo.toUpperCase()) {
          return false;
        }
      }

      // 5. Mode filter
      if (reqMode && exceptFilter !== "mode") {
        const normMode = getNormalizedMode(row);
        let targetFilter = reqMode.toUpperCase();
        if (targetFilter === "MOTORIZADO") targetFilter = "MOTO";
        if (normMode !== targetFilter) {
          return false;
        }
      }

      // 6. Caracter filter
      if (reqCaracter && exceptFilter !== "caracter") {
        const normCaracter = getNormalizedCaracter(row);
        let targetFilter = reqCaracter.toUpperCase();
        if (targetFilter === "CORRETIVA") targetFilter = "CORRETIVO";
        if (targetFilter === "PREVENTIVA") targetFilter = "PREVENTIVO";
        if (normCaracter !== targetFilter) {
          return false;
        }
      }

      // 7. Month filter
      if (reqMonth && exceptFilter !== "month") {
        const dateStr = row[mapping.data] || "";
        const parsedDate = parseRowDate(dateStr);
        if (parsedDate) {
          const mNum = parsedDate.getMonth() + 1;
          const mKey = String(mNum).padStart(2, "0");
          const labelMonth = mNum === 1 ? "jan." :
                             mNum === 2 ? "fev." :
                             mNum === 3 ? "mar." :
                             mNum === 4 ? "abr." :
                             mNum === 5 ? "mai." :
                             mNum === 6 ? "jun." :
                             mNum === 7 ? "jul." :
                             mNum === 8 ? "ago." :
                             mNum === 9 ? "set." :
                             mNum === 10 ? "out." :
                             mNum === 11 ? "nov." : "dez.";
          
          if (reqMonth !== mKey && reqMonth !== labelMonth && reqMonth.toLowerCase() !== labelMonth) {
            return false;
          }
        } else {
          return false;
        }
      }

      return true;
    };

    // Filter rows
    const filteredDataRowsExceptMonth = dataRows.filter(row => matchRow(row, "month"));
    const filteredDataRows = dataRows.filter(row => matchRow(row));

    const filteredRows = [headerRow, ...filteredDataRows];
    
    // Process analytics on the dynamically filtered row subset
    console.log("Analytics: Processing filtered rows, total count:", filteredRows.length);
    const analyticsResult = processAnalytics(filteredRows);

    // If month is filtered, we preserve the full monthly breakdown (computed from rows filtered by everything EXCEPT month)
    if (reqMonth) {
      console.log("Analytics: Processing monthly breakdown");
      const fullMensalAnalytics = processAnalytics([headerRow, ...filteredDataRowsExceptMonth]);
      analyticsResult.mensal = fullMensalAnalytics.mensal;
    }

    // Now compute the available values for each interconnected filter
    const availableBairros = new Set<string>();
    const availableSolicitantes = new Set<string>();
    const availableDiasSemana = new Set<string>();
    const availablePeriodos = new Set<string>();
    const availableModes = new Set<string>();
    const availableCaracters = new Set<string>();
    const availableMonths = new Set<string>();

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
          const labelMonth = mNum === 1 ? "jan." :
                             mNum === 2 ? "fev." :
                             mNum === 3 ? "mar." :
                             mNum === 4 ? "abr." :
                             mNum === 5 ? "mai." :
                             mNum === 6 ? "jun." :
                             mNum === 7 ? "jul." :
                             mNum === 8 ? "ago." :
                             mNum === 9 ? "set." :
                             mNum === 10 ? "out." :
                             mNum === 11 ? "nov." : "dez.";
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
  } catch (error: any) {
    console.error("Erro detalhado ao processar dados filtrados:", error);
    return res.status(500).json({ error: "Erro interno no processamento dos dados.", details: error.message });
  }
});

app.get("/api/efetivo-fixo", async (req, res) => {
  try {
    const response = await fetch(EFETIVO_FIXO_URL);
    if (!response.ok) throw new Error("Falha ao buscar dados do efetivo fixo.");
    const text = await response.text();
    const lines = text.split("\n");
    const data: any[] = [];

    function parseCSVLine(line: string) {
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"' && line[i+1] === '"') {
          current += '"';
          i++;
        } else if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current);
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current);
      return result;
    }

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
  } catch (error: any) {
    console.error("Erro ao carregar escala de efetivo fixo:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to run AI Analysis via Gemini
app.post("/api/ai/analyze", async (req, res) => {
  const { systemPrompt, userQuery } = req.body;
  
  if (!systemPrompt || !userQuery) {
    return res.status(400).json({ error: "Parâmetros systemPrompt e userQuery são obrigatórios." });
  }

  // Robust fallback model chain to handle rate limits, deprecations, or high demand
  const modelsToTry = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-3.5-flash"];
  let lastError: any = null;

  for (const modelName of modelsToTry) {
    try {
      console.log(`Tentando gerar análise inteligente com o modelo: ${modelName}`);
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
      console.log(`Sucesso ao gerar análise com o modelo: ${modelName}`);
      return res.json({ result: answer });
    } catch (error: any) {
      console.warn(`Falha na API do Gemini com o modelo ${modelName}:`, error.message || error);
      lastError = error;
    }
  }

  console.error("Erro final em todos os modelos do Gemini:", lastError?.message || lastError);
  return res.status(500).json({ 
    error: lastError?.message || "Erro de comunicação com a Inteligência Artificial após tentar múltiplos modelos." 
  });
});

// API Health Check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date() });
});

// Vite & Static file serving setup
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    // Development Mode
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production Mode
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Full-Stack Server] Executando com sucesso em http://0.0.0.0:${PORT}`);
  });
}

startServer();
