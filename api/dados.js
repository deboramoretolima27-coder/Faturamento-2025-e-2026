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
}export default async function handler(req, res) {
  const fresco = req.query && (req.query.fresh === "1" || req.query.fresh === 1);
  res.setHeader("Cache-Control", fresco ? "no-store, max-age=0" : "s-maxage=180, stale-while-revalidate=600");

  if (!process.env.MONDAY_TOKEN) {
    return res.status(500).json({ erro: "MONDAY_TOKEN nao cadastrado no Vercel." });
  }

  try {
    const primeira = `query { boards(ids: ${BOARD_ID}) { name items_page(limit: 250) { cursor items { id name column_values(ids: ${IDS}) { id text } } } } }`;
    const d0 = await monday(primeira);
    const board = d0.boards[0];
    let itens = board.items_page.items;
    let cursor = board.items_page.cursor;

    const proxima = `query($c: String!) { next_items_page(limit: 250, cursor: $c) { cursor items { id name column_values(ids: ${IDS}) { id text } } } }`;

    while (cursor) {
      const d = await monday(proxima, { c: cursor });
      itens = itens.concat(d.next_items_page.items);
      cursor = d.next_items_page.cursor;
    }

    const fat = {}, qtd = {}, canal = {};
    const mOrigem = {}, mEstado = {}, mCidade = {}, mVendedor = {};
    ANOS.forEach((a) => {
      fat[a] = new Array(12).fill(0);
      qtd[a] = new Array(12).fill(0);
      canal[a] = Array.from({ length: 12 }, () => ({ l: 0, o: 0 }));
      mOrigem[a] = {}; mEstado[a] = {}; mCidade[a] = {}; mVendedor[a] = {};
    });

    const semAno = { qtd: 0, fat: 0 };
    const lista = [];
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
        semAno.qtd += 1; semAno.fat += valor;
        return;
      }

      const mi = MESES.indexOf((cv[COL.mes] || "").trim());
      if (mi >= 0) {
        fat[ano][mi] += valor;
        qtd[ano][mi] += 1;
        const c = (cv[COL.canal] || "").trim().toLowerCase();
        if (c === "loja") canal[ano][mi].l += 1;
        else if (c === "online") canal[ano][mi].o += 1;
      }

      lista.push({
        n: it.name, a: ano, m: mi, v: valor, d: cv[COL.data] || "",
        c: vazio(cv[COL.canal]) ? "" : cv[COL.canal].trim(),
        o: vazio(cv[COL.origem]) ? "" : cv[COL.origem].trim(),
        e: vazio(cv[COL.estado]) ? "" : cv[COL.estado].trim(),
        ci: vazio(cv[COL.cidade]) ? "" : cv[COL.cidade].trim(),
        vd: vazio(cv[COL.vendedor]) ? "" : cv[COL.vendedor].trim(),
      });

      if (!vazio(cv[COL.origem])) somar(mOrigem[ano], cv[COL.origem].trim(), valor);
      if (!vazio(cv[COL.estado])) somar(mEstado[ano], cv[COL.estado].trim(), valor);
      if (!vazio(cv[COL.cidade])) somar(mCidade[ano], cv[COL.cidade].trim(), valor);

      if (vazio(cv[COL.vendedor])) {
        semVendedor[ano].qtd += 1;
        semVendedor[ano].fat += valor;
      } else {
        somar(mVendedor[ano], cv[COL.vendedor].trim(), valor);
      }
    });

    const origens = {}, estados = {}, cidades = {}, vendedores = {};
    ANOS.forEach((a) => {
      origens[a] = ranking(mOrigem[a], 12);
      estados[a] = ranking(mEstado[a], 10);
      cidades[a] = ranking(mCidade[a], 8);
      vendedores[a] = ranking(mVendedor[a], 12);
    });

    res.status(200).json({
      quadro: board.name,
      atualizado: new Date().toISOString(),
      total: itens.length,
      fat, qtd, canal,
      origens, estados, cidades, vendedores,
      metas: METAS,
      vendas: lista,
      sem_vendedor: semVendedor,
      sem_ano: semAno,
    });
  } catch (e) {
    res.status(500).json({ erro: String(e.message || e) });
  }
}
