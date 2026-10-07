// Analytics (ronde 3, zie docs/ontwerp-beheerportaal.md): bezoek aan de site (Google Analytics) en
// zoekverkeer (Search Console), met bij elk cijfer de verandering ten opzichte van de vorige periode.
// Elk onderdeel staat op zichzelf: faalt het ene, dan blijft het andere zichtbaar.
import { esc, layout } from './adminUi.js';
import { delta } from './adminFormat.js';
import { chrome } from './adminOrders.js';
import { gaReport, scQuery, parseServiceAccount, GoogleError } from './google.js';
import {
  ANALYTICS_PERIODS, analyticsPeriodOr, dateRanges, parseTotals, parseEvents, parseList, parseDaily, parseScTotals,
  parseScQueries, channelLabel, pageLabel, positionDelta, rangeLabel
} from './analyticsData.js';

const nf = (n) => new Intl.NumberFormat('nl-NL').format(Math.round(n));
const pct = (x) => `${(x * 100).toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const pos = (x) => (x > 0 ? x.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '–');

const ERRORS = {
  niet_ingesteld: 'De koppeling met Google is nog niet ingesteld.',
  sleutel_ongeldig: 'De sleutel voor Google is niet geldig. Controleer het geheim GOOGLE_SA_JSON in de Worker.',
  geen_toegang: 'Geen toegang. Voeg het e-mailadres van het servicegebruik toe als lezer: Kijker in Analytics en Beperkt in Search Console.',
  api_uit: 'Deze Google-API staat nog uit. Zet hem aan in je Google Cloud-project (Google Analytics Data API of Google Search Console API).',
  niet_gevonden: 'Niet gevonden. Controleer het Property-ID (GA4_PROPERTY_ID) of de Search Console-eigenschap (SEARCH_CONSOLE_SITE).',
  limiet: 'Google vraagt even te wachten. Probeer het over een minuut opnieuw.',
  fout: 'Google gaf een onverwachte fout. Probeer het later opnieuw.'
};
const errorBox = (e) => `<p class="card card__pad error" role="alert">${esc(ERRORS[e?.code] || ERRORS.fout)}</p>`;

const deltaHtml = (d) => `<span class="delta delta--${d.dir}">${d.dir === 'up' ? '▲ ' : d.dir === 'down' ? '▼ ' : ''}${esc(d.text)}</span>`;
const kpi = (label, value, d) => `<div class="kpi"><div class="kpi__label">${esc(label)}</div><div class="kpi__value">${value}</div>${deltaHtml(d)}</div>`;
const countKpi = (label, cur, prev) => kpi(label, nf(cur), delta(cur, prev, prev, 'gegevens'));

// Staafgrafiek met echte reeks: as met waarden en data, geen versiering. Alles via attributen (geen inline stijl).
function barChart(series, label) {
  const W = 960; const H = 230; const L = 44; const B = 28; const T = 8;
  const max = Math.max(1, ...series.map((p) => p.value));
  const top = max <= 4 ? max : Math.ceil(max / 4) * 4;
  const plotH = H - B - T;
  const bw = (W - L) / series.length;
  const bars = series.map((p, i) => {
    const h = Math.round((p.value / top) * plotH);
    return `<rect x="${(L + i * bw + bw * 0.15).toFixed(1)}" y="${T + plotH - h}" width="${Math.max(1, bw * 0.7).toFixed(1)}" height="${h}" rx="${bw > 8 ? 3 : 0}"><title>${esc(p.date)}: ${p.value}</title></rect>`;
  }).join('');
  const short = (d) => new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}" preserveAspectRatio="xMidYMid meet">
<line class="chart__grid" x1="${L}" y1="${T}" x2="${W}" y2="${T}"/><line class="chart__grid" x1="${L}" y1="${T + plotH / 2}" x2="${W}" y2="${T + plotH / 2}"/><line class="chart__axis" x1="${L}" y1="${T + plotH}" x2="${W}" y2="${T + plotH}"/>
<text class="chart__label" x="${L - 6}" y="${T + 4}" text-anchor="end">${top}</text><text class="chart__label" x="${L - 6}" y="${T + plotH / 2 + 4}" text-anchor="end">${top / 2}</text><text class="chart__label" x="${L - 6}" y="${T + plotH + 4}" text-anchor="end">0</text>
<text class="chart__label" x="${L}" y="${H - 6}">${esc(short(series[0].date))}</text><text class="chart__label" x="${W}" y="${H - 6}" text-anchor="end">${esc(short(series[series.length - 1].date))}</text>
<g class="chart__bars">${bars}</g></svg>`;
}

function rankList(items, emptyText, fmt = (x) => x) {
  if (!items.length) return `<p class="muted">${esc(emptyText)}</p>`;
  const max = Math.max(...items.map((i) => i.value), 1);
  return `<ol class="rank">${items.map((i) => `<li><div class="rank__row"><span>${esc(fmt(i.label))}</span><span class="tnum"><strong>${nf(i.value)}</strong></span></div><progress class="bar" max="100" value="${Math.max(3, Math.round((i.value / max) * 100))}" aria-hidden="true"></progress></li>`).join('')}</ol>`;
}

function setupCard() {
  return `<section class="card card__pad card--narrow"><h2>Koppel Google Analytics</h2>
<p>Het beheer leest de cijfers zelf uit Google, zodat je ze hier ziet zonder in Analytics te hoeven kijken. Daarvoor is een eenmalige koppeling nodig met alleen leesrechten.</p>
<ol class="steps"><li>Maak in Google Cloud een project en zet de <strong>Google Analytics Data API</strong> en de <strong>Google Search Console API</strong> aan.</li>
<li>Maak een <strong>serviceaccount</strong> met een JSON-sleutel.</li>
<li>Geef het e-mailadres van dat serviceaccount de rol <strong>Kijker</strong> in Analytics en <strong>Beperkt</strong> in Search Console.</li>
<li>Zet de volledige inhoud van het JSON-bestand als geheim <code>GOOGLE_SA_JSON</code> in de Worker, en vul het Property-ID in als <code>GA4_PROPERTY_ID</code>.</li></ol>
<p class="note">Zie <code>docs/analytics-koppelen.md</code> voor de stappen.</p></section>`;
}

export async function analyticsPage(env, request, user, url) {
  const period = analyticsPeriodOr(url.searchParams.get('periode'));
  const { csrf, counts } = await chrome(env, request);
  const r = dateRanges(period);
  const tabs = Object.entries(ANALYTICS_PERIODS).map(([k, v]) => `<a href="/admin/analytics?periode=${k}"${k === period ? ' aria-current="page"' : ''}>${esc(v.label)}</a>`).join('');
  let body = `<div class="page-head"><div><h1>Analytics</h1><p>${esc(rangeLabel(r.current))}, vergeleken met ${esc(rangeLabel(r.previous))}.</p></div><nav class="period" aria-label="Periode">${tabs}</nav></div>`;

  if (!parseServiceAccount(env)) {
    return layout('Analytics', body + setupCard(), { user, csrf, active: 'analytics', counts });
  }

  const prop = env.GA4_PROPERTY_ID;
  const site = env.SEARCH_CONSOLE_SITE || 'sc-domain:eetbuyt.nl';
  const two = [{ startDate: r.current.start, endDate: r.current.end }, { startDate: r.previous.start, endDate: r.previous.end }];
  const one = [two[0]];
  const m = (...names) => names.map((name) => ({ name }));
  // Alleen bezoek aan de echte site tellen: testbezoek vanaf localhost of een voorbeeldadres telt niet mee.
  const host = { filter: { fieldName: 'hostName', inListFilter: { values: ['eetbuyt.nl', 'www.eetbuyt.nl'] } } };
  const [totals, events, daily, channels, sources, pages, scNow, scPrev, scQueries] = await Promise.allSettled([
    gaReport(env, prop, { dateRanges: two, metrics: m('activeUsers', 'sessions', 'screenPageViews'), dimensionFilter: host }),
    gaReport(env, prop, { dateRanges: two, dimensions: m('eventName'), metrics: m('eventCount'), dimensionFilter: { andGroup: { expressions: [host, { filter: { fieldName: 'eventName', inListFilter: { values: ['add_to_cart', 'purchase', 'generate_lead', 'sign_up'] } } }] } } }),
    gaReport(env, prop, { dateRanges: one, dimensions: m('date'), metrics: m('activeUsers'), dimensionFilter: host, orderBys: [{ dimension: { dimensionName: 'date' } }], limit: 200 }),
    gaReport(env, prop, { dateRanges: one, dimensions: m('sessionDefaultChannelGroup'), metrics: m('sessions'), dimensionFilter: host, orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 8 }),
    gaReport(env, prop, { dateRanges: one, dimensions: m('sessionSourceMedium'), metrics: m('sessions'), dimensionFilter: host, orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 8 }),
    gaReport(env, prop, { dateRanges: one, dimensions: m('pagePath'), metrics: m('screenPageViews'), dimensionFilter: host, orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: 8 }),
    scQuery(env, site, { startDate: r.sc.current.start, endDate: r.sc.current.end }),
    scQuery(env, site, { startDate: r.sc.previous.start, endDate: r.sc.previous.end }),
    scQuery(env, site, { startDate: r.sc.current.start, endDate: r.sc.current.end, dimensions: ['query'], rowLimit: 10 })
  ]);

  // Bezoek
  body += '<h2 class="section-h">Bezoek aan de site</h2>';
  if (totals.status === 'rejected') {
    body += errorBox(totals.reason);
  } else {
    const t = parseTotals(totals.value, ['activeUsers', 'sessions', 'screenPageViews']);
    const ev = events.status === 'fulfilled' ? parseEvents(events.value) : { current: {}, previous: {} };
    const evCount = (w, n) => ev[w][n] || 0;
    body += `<section class="card"><div class="kpis">
${countKpi('Bezoekers', t.current.activeUsers, t.previous.activeUsers)}
${countKpi('Sessies', t.current.sessions, t.previous.sessions)}
${countKpi("Pagina's bekeken", t.current.screenPageViews, t.previous.screenPageViews)}
</div></section>
<section class="card"><div class="kpis">
${countKpi('Toegevoegd aan mandje', evCount('current', 'add_to_cart'), evCount('previous', 'add_to_cart'))}
${countKpi('Aankopen', evCount('current', 'purchase'), evCount('previous', 'purchase'))}
${countKpi('Aanvragen en aanmeldingen', evCount('current', 'generate_lead') + evCount('current', 'sign_up'), evCount('previous', 'generate_lead') + evCount('previous', 'sign_up'))}
</div></section>
<p class="note">Alleen bezoekers die cookies accepteren worden geteld, dus het echte bezoek ligt hoger. Bestellingen komen uit de database en zijn leidend; dit zijn indicaties.</p>`;
    if (daily.status === 'fulfilled') {
      const series = parseDaily(daily.value, r.current);
      body += `<section class="card card__pad grid-2--gap"><h2>Bezoekers per dag</h2>${series.some((p) => p.value > 0) ? barChart(series, `Bezoekers per dag, ${rangeLabel(r.current)}`) : '<p class="muted">Nog geen bezoek in deze periode. Een nieuwe koppeling kan tot een dag duren voor er cijfers zijn.</p>'}</section>`;
    }
    const channelList = channels.status === 'fulfilled' ? parseList(channels.value, 8) : [];
    const sourceList = sources.status === 'fulfilled' ? parseList(sources.value, 8) : [];
    const pageList = pages.status === 'fulfilled' ? parseList(pages.value, 8) : [];
    body += `<div class="grid-2 grid-2--gap"><section class="card card__pad"><h2>Waar komen bezoekers vandaan?</h2>${rankList(channelList, 'Nog geen gegevens.', channelLabel)}</section>
<section class="card card__pad"><h2>Bronnen</h2>${rankList(sourceList, 'Nog geen gegevens.')}</section></div>
<section class="card card__pad grid-2--gap"><h2>Best bezochte pagina's</h2>${rankList(pageList, 'Nog geen gegevens.', pageLabel)}</section>`;
  }

  // Zoekverkeer
  body += '<h2 class="section-h">Zoekverkeer (Google Zoeken)</h2>';
  if (scNow.status === 'rejected') {
    body += errorBox(scNow.reason);
  } else {
    const cur = parseScTotals(scNow.value);
    const prev = scPrev.status === 'fulfilled' ? parseScTotals(scPrev.value) : { clicks: 0, impressions: 0, ctr: 0, position: 0 };
    const queries = scQueries.status === 'fulfilled' ? parseScQueries(scQueries.value) : [];
    body += `<section class="card"><div class="kpis">
${countKpi('Klikken vanuit Google', cur.clicks, prev.clicks)}
${countKpi('Vertoningen', cur.impressions, prev.impressions)}
${kpi('Gemiddelde positie', pos(cur.position), positionDelta(cur.position, prev.position))}
</div></section>`;
    body += queries.length
      ? `<section class="card table-wrap grid-2--gap"><table class="table"><thead><tr><th scope="col">Zoekterm</th><th scope="col" class="num">Klikken</th><th scope="col" class="num">Vertoningen</th><th scope="col" class="num">Klikpercentage</th><th scope="col" class="num">Positie</th></tr></thead><tbody>${queries.map((q) => `<tr><td class="c-main">${esc(q.query)}</td><td class="num tnum c-wide" data-label="Klikken:">${nf(q.clicks)}</td><td class="num tnum c-wide" data-label="Vertoningen:">${nf(q.impressions)}</td><td class="num tnum c-wide" data-label="Klikpercentage:">${pct(q.ctr)}</td><td class="num tnum c-wide" data-label="Positie:">${pos(q.position)}</td></tr>`).join('')}</tbody></table></section>`
      : '<section class="card card__pad grid-2--gap"><p class="muted">Nog geen zoektermen. Search Console loopt een paar dagen achter en een nieuwe site heeft even tijd nodig voor Google hem toont.</p></section>';
    body += `<p class="note">Search Console loopt twee tot drie dagen achter (${esc(rangeLabel(r.sc.current))}).</p>`;
  }
  return layout('Analytics', body, { user, csrf, active: 'analytics', counts });
}
