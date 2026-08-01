// api/dados.js  ·  ponte entre o Vercel e o quadro Analise Anual 2025 e 2026
// O token nunca fica aqui. Ele vem da variavel MONDAY_TOKEN cadastrada no Vercel.

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

// Metas oficiais CiaDoSono. 2025 nao teve meta definida.
// Para trocar de ano, basta editar esta tabela.
const METAS = {
  "2026": {
    meta:  [454577.04,323016.31,267805.03,298884.38,467056.16,407812.08,
            297332.72,642585.48,425923.56,399516.48,460468.91,165424.84],
    super: [511399.17,363393.35,301280.66,336244.93,525438.18,458788.59,
            334499.31,722908.67,479164.01,449456.04,518027.52,186102.95],
    hiper: [587162.01,417229.40,345914.83,386059.00,603280.88,526757.27,
            384054.77,830006.25,550151.27,516042.12,594772.34,213673.76],
  },
};

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
               "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

const ANOS = ["2025", "2026"];

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

// Transforma um mapa nome/quantidade em lista ordenada, cortando na posicao pedida.
function ranking(mapa, corte) {
  return Object.keys(mapa)
    .map((nome) => ({ nome, qtd: mapa[nome].qtd, fat: Math.round(mapa[nome].fat) }))
    .sort((a, b) => b.qtd - a.qtd)
    .slice(0, corte);
}

export default async function handler(req, res) {
  // O botao Atualizar chama com ?fresh=1 e pula o cache. As demais visitas usam a copia guardada.
  const fresco = req.query && (req.query.fresh === "1" || req.query.fresh === 1);
  res.setHeader(
    "Cache-Control",
    fresco ? "no-store, max-age=0" : "s-maxage=180, stale-while-revalidate=600"
  );

  if (!process.env.MONDAY_TOKEN) {
    return res.status(500).json({ erro: "MONDAY_TOKEN nao cadastrado no Vercel." });
  }

  try {
    const primeira = `query {
      boards(ids: ${BOARD_ID}) {
        name
        items_page(limit: 500) {
          cursor
          items { id name column_values { id text } }
        }
      }
    }`;

    const d0 = await monday(primeira);
    const board = d0.boards[0];
    let itens = board.items_page.items;
    let cursor = board.items_page.cursor;

    const proxima = `query($c: String!) {
      next_items_page(limit: 500, cursor: $c) {
        cursor
        items { id name column_values { id text } }
      }
    }`;

    while (cursor) {
      const d = await monday(proxima, { c: cursor });
      itens = itens.concat(d.next_items_page.items);
      cursor = d.next_items_page.cursor;
    }

    // Estruturas por ano
    const fat = {}, qtd = {}, canal = {};
    const mapaOrigem = {}, mapaEstado = {}, mapaCidade = {}, mapaVendedor = {};
    ANOS.forEach((a) => {
      fat[a] = new Array(12).fill(0);
      qtd[a] = new Array(12).fill(0);
      canal[a] = Array.from({ length: 12 }, () => ({ l: 0, o: 0 }));
      mapaOrigem[a] = {}; mapaEstado[a] = {}; mapaCidade[a] = {}; mapaVendedor[a] = {};
    });

    const semAno = { qtd: 0, fat: 0 };
    const lista = [];   // vendas individuais, para o detalhamento por clique
    const semVendedor = { "2025": { qtd: 0, fat: 0 }, "2026": { qtd: 0, fat: 0 } };

    function somar(mapa, chave, valor) {
      if (!mapa[chave]) mapa[chave] = { qtd: 0, fat: 0 };
      mapa[chave].qtd += 1;
      mapa[chave].fat += valor;
    }

    itens.forEach((it) => {
      const cv = {};
      it.column_values.forEach((c) => (cv[c.id] = c.text));

      const ano = (cv[COL.ano] || "").trim();
      const valor = num(cv[COL.valor]);

      if (ANOS.indexOf(ano) === -1) {
        semAno.qtd += 1;
