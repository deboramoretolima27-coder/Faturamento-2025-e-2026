const BOARD_ID = "18424710436";

const COL = {
  ano:      "color_mm5tgycy",
  mes:      "color_mm5tn4j6",
  canal:    "color_mm5tzffa",
  valor:    "numeric_mm5tyjjm",
  origem:   "color_mm5tfhvz",
  estado:   "color_mm5tzey",
  cidade:   "dropdown_mm5tqq3w",
  vendedor: "color_mm5tga5s",
  data:     "date_mm5ts0ng",
};

const METAS = {
  "2026": {
    meta:  [454577.04,323016.31,267805.03,298884.38,467056.16,407812.08,297332.72,642585.48,425923.56,399516.48,460468.91,165424.84],
    super: [511399.17,363393.35,301280.66,336244.93,525438.18,458788.59,334499.31,722908.67,479164.01,449456.04,518027.52,186102.95],
    hiper: [587162.01,417229.40,345914.83,386059.00,603280.88,526757.27,384054.77,830006.25,550151.27,516042.12,594772.34,213673.76],
  },
};

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const ANOS = ["2025", "2026"];
const IDS = JSON.stringify(Object.keys(COL).map((k) => COL[k]));

function num(t) {
  if (!t) return 0;
  let s = String(t).trim();
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s.replace(/[^\d.-]/g, ""));
  return isNaN(n) ? 0 : n;
}

function vazio(t) {
  if (!t) return true;
  const s = String(t).trim().toLowerCase();
  return s === "" || s === "não informado" || s === "nao informado";
}

async function monday(query, variables = {}) {
  const r = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": process.env.MONDAY_TOKEN,
      "API-Version": "2024-10",
    },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

function ranking(mapa, corte) {
  return Object.keys(mapa)
    .map((nome) => ({ nome, qtd: mapa[nome].qtd, fat: Math.round(mapa[nome].fat) }))
    .sort((a, b) => b.qtd - a.qtd)
    .slice(0, corte);
}
