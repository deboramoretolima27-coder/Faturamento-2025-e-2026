// api/funil.mjs  ·  ponte entre o Vercel e o quadro Performance Comercial 2026
// A extensao .mjs garante que o Node leia como modulo, sem depender do package.json.
// O token nunca fica aqui. Ele vem da variavel MONDAY_TOKEN cadastrada no Vercel.

const BOARD_ID = "18424925514";

const COL = {
  entrada:    "date_mm5wcp0w",   // data de entrada do lead
  diaSemana:  "color_mm5wrske",
  cliente:    "dropdown_mm5w5156",
  cidade:     "dropdown_mm5wxgd5",
  origem:     "color_mm5wtcv0",
  parceiro:   "color_mm5wbehh",  // quem indicou
  modalidade: "color_mm5w8rqv",  // Loja Quintino ou Online
  vendedor:   "color_mm5wf0bg",
  prod1:      "text_mm5wcv8a",
  prod2:      "text_mm5wdj04",
  prod3:      "text_mm5wt679",
  prod4:      "text_mm5whknx",
  prod5:      "text_mm5wwq56",
  funil:      "color_mm5whr4s",
  etapa:      "color_mm5wh7wc",  // Em aberto, Venda Ganha, Venda Perdida
  status:     "color_mm5wksjk",  // estagio detalhado
  fechamento: "date_mm5w9n3h",
  valor:      "numeric_mm5w1r24",
  dias:       "numeric_mm5wtkb7", // dias entre entrada e fechamento
  mesRef:     "date_mm5waj71",
};

const IDS = JSON.stringify(Object.keys(COL).map((k) => COL[k]));

function num(t) {
  if (!t) return 0;
  let s = String(t).trim();
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s.replace(/[^\d.-]/g, ""));
  return isNaN(n) ? 0 : n;
}

function limpo(t) {
  if (!t) return "";
  const s = String(t).trim();
  const b = s.toLowerCase();
  if (b === "" || b === "não informado" || b === "nao informado") return "";
  return s;
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

// "2 Travesseiros" vira {qtd:2, tipo:"Travesseiro"}. Sem quantidade, assume 1.
function produto(t) {
  const s = limpo(t);
  if (!s) return null;
  const m = s.match(/^\s*(\d+)\s*(.*)$/);
  const qtd = m ? parseInt(m[1], 10) : 1;
  let tipo = (m ? m[2] : s).trim();
  const b = tipo.toLowerCase();
  if (b.indexOf("colch") > -1) tipo = "Colchão";
  else if (b.indexOf("travess") > -1) tipo = "Travesseiro";
  else if (b.indexOf("cama") > -1) tipo = "Cama";
  else if (b.indexOf("box") > -1) tipo = "Box";
  else if (b.indexOf("cabece") > -1) tipo = "Cabeceira";
  else if (b.indexOf("capa") > -1 || b.indexOf("protetor") > -1) tipo = "Capa";
  else tipo = tipo || "Outros";
  return { qtd: qtd || 1, tipo: tipo };
}

export default async function handler(req, res) {
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
        items_page(limit: 250) {
          cursor
          items { id name column_values(ids: ${IDS}) { id text } }
        }
      }
    }`;

    const d0 = await monday(primeira);
    const board = d0.boards[0];
    let itens = board.items_page.items;
    let cursor = board.items_page.cursor;

    const proxima = `query($c: String!) {
      next_items_page(limit: 250, cursor: $c) {
        cursor
        items { id name column_values(ids: ${IDS}) { id text } }
      }
    }`;

    while (cursor) {
      const d = await monday(proxima, { c: cursor });
      itens = itens.concat(d.next_items_page.items);
      cursor = d.next_items_page.cursor;
    }

    const leads = itens.map((it) => {
      const cv = {};
      it.column_values.forEach((c) => (cv[c.id] = c.text));

      const prods = [COL.prod1, COL.prod2, COL.prod3, COL.prod4, COL.prod5]
        .map((id) => produto(cv[id]))
        .filter(Boolean);

      const entrada = limpo(cv[COL.entrada]).slice(0, 10);
      const fecha = limpo(cv[COL.fechamento]).slice(0, 10);
      const etapa = limpo(cv[COL.etapa]);
      const status = limpo(cv[COL.status]);

      // A etapa e o status as vezes divergem no quadro. O status detalhado manda.
      const b = status.toLowerCase();
      let situacao = "aberto";
      if (b.indexOf("ganha") > -1) situacao = "ganha";
      else if (b.indexOf("perdid") > -1) situacao = "perdida";
      else if (etapa.toLowerCase().indexOf("ganha") > -1) situacao = "ganha";
      else if (etapa.toLowerCase().indexOf("perdid") > -1) situacao = "perdida";

      // Motivo da perda, tirado do parenteses do status.
      let motivo = "";
      if (situacao === "perdida") {
        const m = status.match(/\(([^)]+)\)/);
        motivo = m ? m[1].trim() : "não informado";
        motivo = motivo.charAt(0).toUpperCase() + motivo.slice(1).toLowerCase();
      }

      return {
        id: it.id,
        n: limpo(cv[COL.cliente]) || it.name,
        e: entrada,                       // data de entrada
        f: fecha,                         // data de fechamento
        me: entrada ? parseInt(entrada.slice(5, 7), 10) - 1 : -1,   // mes de entrada
        mf: fecha ? parseInt(fecha.slice(5, 7), 10) - 1 : -1,       // mes de fechamento
        v: num(cv[COL.valor]),
        d: num(cv[COL.dias]),             // dias ate fechar
        s: situacao,                      // ganha, perdida ou aberto
        st: status,                       // estagio detalhado
        mo: motivo,                       // motivo da perda
        o: limpo(cv[COL.origem]),
        md: limpo(cv[COL.modalidade]),
        vd: limpo(cv[COL.vendedor]),
        ci: limpo(cv[COL.cidade]),
        pa: limpo(cv[COL.parceiro]),
        dw: limpo(cv[COL.diaSemana]),
        p: prods,
      };
    });

    res.status(200).json({
      quadro: board.name,
      atualizado: new Date().toISOString(),
      total: leads.length,
      leads,
    });
  } catch (e) {
    res.status(500).json({ erro: String(e.message || e) });
  }
}
