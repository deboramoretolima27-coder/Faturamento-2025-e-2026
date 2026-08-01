const BOARD_ID = 18424710436;
const COL = {
  ano: "color_mm5tgycy", mes: "color_mm5tn4j6", canal: "color_mm5tzffa",
  origem: "color_mm5tfhvz", estado: "color_mm5tzey", cidade: "dropdown_mm5tqq3w",
  valor: "numeric_mm5tyjjm"
};
const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

async function mondayQuery(query, token) {
  const r = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": token },
    body: JSON.stringify({ query })
  });
  return r.json();
}

export default async function handler(req, res) {
  const token = process.env.MONDAY_TOKEN;
  if (!token) { res.status(500).json({ error: "Token não configurado" }); return; }

  try {
    let items = [];
    let first = await mondayQuery(
      `{ boards(ids:${BOARD_ID}){ items_page(limit:200){ cursor items{ column_values{ id text } } } } }`, token);
    let pageData = first.data.boards[0].items_page;
    items = items.concat(pageData.items);
    let cursor = pageData.cursor;
    while (cursor) {
      const nx = await mondayQuery(
        `{ next_items_page(limit:200, cursor:"${cursor}"){ cursor items{ column_values{ id text } } } }`, token);
      pageData = nx.data.next_items_page;
      items = items.concat(pageData.items);
      cursor = pageData.cursor;
    }

    const blank = () => Array.from({length:12}, () => 0);
    const fat = { 2025: blank(), 2026: blank() };
    const qtd = { 2025: blank(), 2026: blank() };
    const canal = { 2025: Array.from({length:12},()=>({l:0,o:0})), 2026: Array.from({length:12},()=>({l:0,o:0})) };
    const origem = {}, estado = {}, cidade = {};

    for (const it of items) {
      const v = {};
      for (const cv of it.column_values) v[cv.id] = cv.text;
      const ano = v[COL.ano], mes = v[COL.mes];
      const val = parseFloat(v[COL.valor] || "0") || 0;
      const mi = MESES.indexOf(mes);
      if ((ano === "2025" || ano === "2026") && mi >= 0) {
        fat[ano][mi] += val; qtd[ano][mi] += 1;
        const c = v[COL.canal];
        if (c === "Loja") canal[ano][mi].l += 1;
        else if (c === "Online") canal[ano][mi].o += 1;
      }
      if (ano === "2026") {
        const o = v[COL.origem] || "Não informado"; origem[o] = (origem[o]||0)+1;
        const e = v[COL.estado]; if (e) estado[e] = (estado[e]||0)+1;
        const cd = v[COL.cidade]; if (cd) cidade[cd] = (cidade[cd]||0)+1;
      }
    }
    const topN = (obj,n)=>Object.entries(obj).sort((a,b)=>b[1]-a[1]).slice(0,n).map(([nome,q])=>({nome,qtd:q}));

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    res.status(200).json({
      atualizado: new Date().toISOString(),
      total: items.length,
      fat, qtd, canal,
      origens: topN(origem, 10),
      estados: topN(estado, 8),
      cidades: topN(cidade, 5)
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
