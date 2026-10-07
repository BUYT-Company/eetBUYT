// Analytics (ronde 3, zie docs/ontwerp-beheerportaal.md): bezoek aan de site (Google Analytics), verkoop (de
// database) en zoekverkeer (Search Console), met bij elk cijfer de verandering ten opzichte van de vorige periode
// en bij elke grafiek de vorige periode als lichte lijn erachter. Elk onderdeel staat op zichzelf: faalt het
// ene, dan blijft het andere zichtbaar.
import { esc, layout } from './adminUi.js';
import { delta, eur, amsterdamToday } from './adminFormat.js';
import { chrome } from './adminOrders.js';
import { select } from './supabase.js';
import { DELIVERY_CITIES, cityStats, canonicalCity } from './cities.js';
import { DELIVERY_ZONES, insideArea } from './geo.js';
import { geocodeMissing } from './geocode.js';
import { gaReport, scQuery, parseServiceAccount } from './google.js';
import {
  ANALYTICS_PERIODS, analyticsPeriodOr, dateRanges, parseTotals, parseEvents, parseList, parseDailyRanges, parseScDaily,
  parseScTotals, parseScQueries, groupOrdersDaily, niceMax, channelLabel, pageLabel, positionDelta, rangeLabel
} from './analyticsData.js';

const nf = (n) => new Intl.NumberFormat('nl-NL').format(Math.round(n));
const pct = (x) => `${(x * 100).toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const pos = (x) => (x > 0 ? x.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '–');
const sum = (series) => series.reduce((a, p) => a + p.value, 0);

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

const shortDate = (d) => new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));

// Staafgrafiek: deze periode als staven, de vorige periode als lichte lijn erachter (dag 1 naast dag 1). Echte reeks met
// assen en waarden. Alles via attributen en klassen (geen inline stijl, anders blokkeert de Content-Security-Policy het).
function chart({ series, prev, label, fmt = nf, title, compact = false }) {
  // Compact is voor grafieken die half breed staan: een kleinere tekening met grotere cijfers, zodat de labels leesbaar blijven.
  const W = compact ? 520 : 960; const H = compact ? 240 : 230; const L = compact ? 62 : 52; const B = 30; const T = 12;
  const max = Math.max(1, ...series.map((p) => p.value), ...(prev || []).map((p) => p.value));
  const top = niceMax(max);
  const plotH = H - B - T;
  const n = series.length;
  const bw = (W - L) / n;
  const y = (v) => T + plotH - (v / top) * plotH;
  const cx = (i) => L + i * bw + bw / 2;
  const bars = series.map((p, i) => {
    const h = Math.round((p.value / top) * plotH);
    const was = prev ? ` (vorige periode: ${fmt(prev[i].value)})` : '';
    return `<rect x="${(L + i * bw + bw * 0.16).toFixed(1)}" y="${T + plotH - h}" width="${Math.max(1, bw * 0.68).toFixed(1)}" height="${h}" rx="${bw > 9 ? 3 : 0}"><title>${esc(shortDate(p.date))}: ${esc(fmt(p.value))}${esc(was)}</title></rect>`;
  }).join('');
  const line = prev && prev.some((p) => p.value > 0)
    ? `<polyline class="chart__prev" points="${prev.map((p, i) => `${cx(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')}"/>`
    : '';
  const mid = Math.floor((n - 1) / 2);
  const xl = (i, anchor) => `<text class="chart__label" x="${anchor === 'end' ? W : anchor === 'start' ? L : cx(i).toFixed(1)}" y="${H - 6}" text-anchor="${anchor}">${esc(shortDate(series[i].date))}</text>`;
  const midLabel = n > 6 ? xl(mid, 'middle') : '';
  const summary = `${label}. Deze periode ${fmt(sum(series))}${prev ? `, vorige periode ${fmt(sum(prev))}` : ''}.`;
  return `<figure class="chartbox"><figcaption class="chartbox__head"><h2>${esc(title)}</h2><div class="legend"><span><i class="dot dot--new"></i>Deze periode</span>${line ? '<span><i class="key-line"></i>Vorige periode</span>' : ''}</div></figcaption>
<svg class="chart${compact ? ' chart--compact' : ''}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(summary)}" preserveAspectRatio="xMidYMid meet">
<line class="chart__grid" x1="${L}" y1="${T}" x2="${W}" y2="${T}"/><line class="chart__grid" x1="${L}" y1="${T + plotH / 2}" x2="${W}" y2="${T + plotH / 2}"/><line class="chart__axis" x1="${L}" y1="${T + plotH}" x2="${W}" y2="${T + plotH}"/>
<text class="chart__label" x="${L - 8}" y="${T + 4}" text-anchor="end">${esc(fmt(top))}</text><text class="chart__label" x="${L - 8}" y="${T + plotH / 2 + 4}" text-anchor="end">${esc(fmt(top / 2))}</text><text class="chart__label" x="${L - 8}" y="${T + plotH + 4}" text-anchor="end">${esc(fmt(0))}</text>
${line}<g class="chart__bars">${bars}</g>${xl(0, 'start')}${midLabel}${xl(n - 1, 'end')}</svg></figure>`;
}

const emptyChart = (title, text) => `<figure class="chartbox"><figcaption class="chartbox__head"><h2>${esc(title)}</h2></figcaption><p class="muted">${esc(text)}</p></figure>`;

function rankList(items, emptyText, fmt = (x) => x) {
  if (!items.length) return `<p class="muted">${esc(emptyText)}</p>`;
  const max = Math.max(...items.map((i) => i.value), 1);
  return `<ol class="rank">${items.map((i) => `<li><div class="rank__row"><span>${esc(fmt(i.label))}</span><span class="tnum"><strong>${nf(i.value)}</strong></span></div><progress class="bar" max="100" value="${Math.max(3, Math.round((i.value / max) * 100))}" aria-hidden="true"></progress></li>`).join('')}</ol>`;
}

// Waar wordt besteld: de zes bezorgsteden altijd bovenaan (ook met nul), daarnaast alle andere plaatsen.
function cityCard(stats, allTime, period) {
  const max = Math.max(1, ...stats.inArea.map((c) => c.count), ...stats.other.map((c) => c.count));
  const share = (n) => (stats.total ? ` · ${Math.round((n / stats.total) * 100)}%` : '');
  const row = (c) => `<li${c.count === 0 ? ' class="rank__zero"' : ''}><div class="rank__row"><span>${esc(c.city)}</span><span class="tnum"><strong>${nf(c.count)}</strong>${share(c.count)}</span></div><progress class="bar" max="100" value="${c.count ? Math.max(3, Math.round((c.count / max) * 100)) : 0}" aria-hidden="true"></progress></li>`;
  const shownOther = stats.other.slice(0, 8);
  const rest = stats.other.slice(8);
  const restRow = rest.length ? `<li><div class="rank__row"><span>Overige plaatsen (${rest.length})</span><span class="tnum"><strong>${nf(rest.reduce((n, c) => n + c.count, 0))}</strong></span></div></li>` : '';
  const scopeLinks = `<nav class="period period--small" aria-label="Bereik van de steden"><a href="/admin/analytics?periode=${period}"${allTime ? '' : ' aria-current="page"'}>Deze periode</a><a href="/admin/analytics?periode=${period}&amp;steden=alles"${allTime ? ' aria-current="page"' : ''}>Sinds het begin</a></nav>`;
  const summary = stats.total
    ? `${nf(stats.inAreaTotal)} van de ${nf(stats.total)} bestellingen (${Math.round((stats.inAreaTotal / stats.total) * 100)}%) komen uit het bezorggebied.`
    : 'Nog geen bestellingen in dit bereik.';
  return `<section class="card card__pad grid-2--gap"><div class="chartbox__head"><h2>Waar wordt besteld?</h2>${scopeLinks}</div>
<p class="muted cities__sum">${esc(summary)}</p>
<div class="grid-2"><div><h3 class="subhead">Bezorggebied</h3><p class="note note--top">${esc(DELIVERY_CITIES.join(', '))}</p><ol class="rank">${stats.inArea.map(row).join('')}</ol></div>
<div><h3 class="subhead">Andere plaatsen</h3>${stats.other.length ? `<ol class="rank">${shownOther.map(row).join('')}${restRow}</ol>` : '<p class="muted">Nog geen bestellingen buiten het bezorggebied.</p>'}</div></div></section>`;
}

// Kaart van bestellingen: de stippen zijn lime binnen het (voorlopige) bezorggebied en koraal erbuiten. De adressen worden bij
// de eerste keer opgezocht via PDOK en bewaard (zie geocode.js). In de pagina staan alleen bestelnummer, plaats en een punt.
const round4 = (x) => Math.round(x * 10000) / 10000;
async function mapSection(env, r, allTime) {
  const title = 'Kaart van bestellingen';
  const card = (inner) => `<section class="card card__pad grid-2--gap"><h2>${title}</h2>${inner}</section>`;
  if (!env.GOOGLE_MAPS_KEY) {
    return card('<p class="muted">De kaart is nog niet gekoppeld. Maak een Google Maps-sleutel en zet die als <code>GOOGLE_MAPS_KEY</code> in <code>wrangler.jsonc</code>. Zie <code>docs/analytics-koppelen.md</code>.</p>');
  }
  let rows;
  try {
    rows = await select(env, 'orders', 'select=order_number,city,street,postcode,created_at,lat,lng,geocoded_at&status=neq.geannuleerd&order=created_at.desc&limit=2000');
  } catch (_) {
    return card('<p class="muted">De kaart werkt pas nadat de database is bijgewerkt (migratie 0009).</p>');
  }
  if (!allTime) rows = rows.filter((o) => { const d = amsterdamToday(new Date(o.created_at)); return d >= r.current.start && d <= r.current.end; });
  let pending = 0;
  try { pending = (await geocodeMissing(env, rows, { max: 40 })).remaining; } catch (_) { /* de kaart werkt ook zonder verse coördinaten */ }
  const placed = rows.filter((o) => typeof o.lat === 'number' && typeof o.lng === 'number');
  const points = placed.map((o) => ({ n: o.order_number, c: canonicalCity(o.city), lat: round4(o.lat), lng: round4(o.lng), in: insideArea({ lat: o.lat, lng: o.lng }) }));
  const inN = points.filter((p) => p.in).length;
  const outN = points.length - inN;
  const missing = rows.length - placed.length;
  // Het blok is gewone gegevens (geen script); "<" wordt onschadelijk gemaakt zodat er niets uit kan breken.
  const json = JSON.stringify({ zones: DELIVERY_ZONES.map((z) => ({ c: z.city, lat: round4(z.lat), lng: round4(z.lng), r: z.radiusKm })), points }).replace(/</g, '\\u003c');
  const notes = [`Elke bezorgstad (${DELIVERY_CITIES.join(', ')}) heeft een eigen cirkel, ongeveer zo groot als de stad zelf. Plaatsen ertussen, zoals Zaandam en Leiden, vallen erbuiten. Postcodes volgen zodra het bezorggebied vastligt.`];
  if (pending > 0) notes.push(`Nog ${pending} ${pending === 1 ? 'adres wordt' : 'adressen worden'} opgezocht. Vernieuw de pagina om ${pending === 1 ? 'die' : 'ze'} te zien.`);
  else if (missing > 0) notes.push(`${missing} ${missing === 1 ? 'bestelling staat' : 'bestellingen staan'} niet op de kaart omdat het adres niet gevonden is.`);
  return `<section class="card card__pad grid-2--gap"><div class="chartbox__head"><h2>${title}</h2><div class="legend"><span><i class="key-circle"></i>Bezorgstad (voorlopig)</span><span><i class="dot dot--lime"></i>Binnen (${inN})</span><span><i class="dot dot--coral"></i>Buiten (${outN})</span></div></div>
<div id="buyt-map" class="map" role="img" aria-label="Kaart met ${points.length} bestellingen: ${inN} binnen en ${outN} buiten het bezorggebied"><p class="map__msg">De kaart wordt geladen…</p></div>
<p class="note">${esc(notes.join(' '))}</p>
<script type="application/json" id="buyt-map-data">${json}</script></section>`;
}
const mapsOption = (html, env) => (env.GOOGLE_MAPS_KEY && html.includes('id="buyt-map"') ? { key: env.GOOGLE_MAPS_KEY } : null);

function setupCard() {
  return `<section class="card card__pad card--narrow"><h2>Koppel Google Analytics</h2>
<p>Het beheer leest de cijfers zelf uit Google, zodat je ze hier ziet zonder in Analytics te hoeven kijken. Daarvoor is een eenmalige koppeling nodig met alleen leesrechten.</p>
<ol class="steps"><li>Maak in Google Cloud een project en zet de <strong>Google Analytics Data API</strong> en de <strong>Google Search Console API</strong> aan.</li>
<li>Maak een <strong>serviceaccount</strong> met een JSON-sleutel.</li>
<li>Geef het e-mailadres van dat serviceaccount de rol <strong>Kijker</strong> in Analytics en <strong>Beperkt</strong> in Search Console.</li>
<li>Zet de volledige inhoud van het JSON-bestand als geheim <code>GOOGLE_SA_JSON</code> in de Worker, en vul het Property-ID in als <code>GA4_PROPERTY_ID</code>.</li></ol>
<p class="note">Zie <code>docs/analytics-koppelen.md</code> voor de stappen.</p></section>`;
}

// Verkoop uit de database: bestellingen en omzet per dag. Los van Google, dus ook zonder koppeling bruikbaar.
async function salesSection(env, r, period, allTime, mapPromise) {
  let orders;
  try {
    // Een dag extra terug in UTC, zodat de zomer- en wintertijd geen bestelling aan de rand missen; per dag wordt daarna op Amsterdamse tijd gegroepeerd.
    const from = new Date(new Date(`${r.previous.start}T00:00:00Z`).getTime() - 86400000).toISOString();
    orders = await select(env, 'orders', `select=created_at,status,city,total_estimate_cents,total_final_cents&created_at=gte.${from}&status=neq.geannuleerd&order=created_at.asc&limit=5000`);
  } catch (_) {
    return '<h2 class="section-h">Verkoop</h2><p class="card card__pad error" role="alert">Kon de bestellingen niet ophalen. Probeer het later opnieuw.</p>';
  }
  // Steden: deze periode, of alle bestellingen sinds het begin.
  let cityOrders = orders.filter((o) => { const d = amsterdamToday(new Date(o.created_at)); return d >= r.current.start && d <= r.current.end; });
  if (allTime) {
    try {
      cityOrders = await select(env, 'orders', 'select=city,status,total_estimate_cents,total_final_cents&status=neq.geannuleerd&limit=5000');
    } catch (_) { /* dan blijft het bij deze periode */ }
  }
  const g = groupOrdersDaily(orders, r.current, r.previous);
  const oc = sum(g.orders.current); const op = sum(g.orders.previous);
  const rc = sum(g.revenue.current); const rp = sum(g.revenue.previous);
  const axis = (cents) => `€ ${nf(cents / 100)}`;
  const any = oc + op > 0;
  return `<h2 class="section-h">Verkoop</h2>
<section class="card"><div class="kpis">${kpi('Bestellingen', nf(oc), delta(oc, op, op))}${kpi('Omzet', eur(rc), delta(rc, rp, op))}${kpi('Gemiddelde bestelwaarde', oc ? eur(Math.round(rc / oc)) : '–', delta(oc ? rc / oc : 0, op ? rp / op : 0, op))}</div></section>
<div class="grid-2 grid-2--gap"><section class="card card__pad">${any ? chart({ series: g.orders.current, prev: g.orders.previous, label: `Bestellingen per dag, ${rangeLabel(r.current)}`, title: 'Bestellingen per dag', compact: true }) : emptyChart('Bestellingen per dag', 'Nog geen bestellingen in deze periode.')}</section>
<section class="card card__pad">${any ? chart({ series: g.revenue.current, prev: g.revenue.previous, label: `Omzet per dag, ${rangeLabel(r.current)}`, title: 'Omzet per dag', fmt: axis, compact: true }) : emptyChart('Omzet per dag', 'Nog geen omzet in deze periode.')}</section></div>
${mapPromise ? await mapPromise : ''}
${cityCard(cityStats(cityOrders), allTime, period)}
<p class="note">Uit de database, dus volledig: alle bestellingen tellen mee, ook van bezoekers zonder cookies. Geannuleerde bestellingen niet. Bedragen zijn deels een schatting zolang producten op gewicht worden berekend.</p>`;
}

export async function analyticsPage(env, request, user, url) {
  const period = analyticsPeriodOr(url.searchParams.get('periode'));
  const { csrf, counts } = await chrome(env, request);
  const allTime = url.searchParams.get('steden') === 'alles';
  const r = dateRanges(period);
  const mapPromise = mapSection(env, r, allTime);
  const tabs = Object.entries(ANALYTICS_PERIODS).map(([k, v]) => `<a href="/admin/analytics?periode=${k}"${k === period ? ' aria-current="page"' : ''}>${esc(v.label)}</a>`).join('');
  let body = `<div class="page-head"><div><h1>Analytics</h1><p>${esc(rangeLabel(r.current))}, vergeleken met ${esc(rangeLabel(r.previous))}.</p></div><nav class="period" aria-label="Periode">${tabs}</nav></div>`;

  if (!parseServiceAccount(env)) {
    const html = body + setupCard() + await salesSection(env, r, period, allTime, mapPromise);
    return layout('Analytics', html, { user, csrf, active: 'analytics', counts, maps: mapsOption(html, env) });
  }

  const prop = env.GA4_PROPERTY_ID;
  const site = env.SEARCH_CONSOLE_SITE || 'sc-domain:eetbuyt.nl';
  const two = [{ startDate: r.current.start, endDate: r.current.end }, { startDate: r.previous.start, endDate: r.previous.end }];
  const one = [two[0]];
  const m = (...names) => names.map((name) => ({ name }));
  // Alleen bezoek aan de echte site tellen: testbezoek vanaf localhost of een voorbeeldadres telt niet mee.
  const host = { filter: { fieldName: 'hostName', inListFilter: { values: ['eetbuyt.nl', 'www.eetbuyt.nl'] } } };
  const sc = (range, extra = {}) => scQuery(env, site, { startDate: range.start, endDate: range.end, ...extra });
  const [totals, events, daily, channels, sources, pages, scNow, scPrev, scQueries, scDayNow, scDayPrev, sales] = await Promise.allSettled([
    gaReport(env, prop, { dateRanges: two, metrics: m('activeUsers', 'sessions', 'screenPageViews'), dimensionFilter: host }),
    gaReport(env, prop, { dateRanges: two, dimensions: m('eventName'), metrics: m('eventCount'), dimensionFilter: { andGroup: { expressions: [host, { filter: { fieldName: 'eventName', inListFilter: { values: ['add_to_cart', 'purchase', 'generate_lead', 'sign_up'] } } }] } } }),
    gaReport(env, prop, { dateRanges: two, dimensions: m('date'), metrics: m('activeUsers'), dimensionFilter: host, orderBys: [{ dimension: { dimensionName: 'date' } }], limit: 400 }),
    gaReport(env, prop, { dateRanges: one, dimensions: m('sessionDefaultChannelGroup'), metrics: m('sessions'), dimensionFilter: host, orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 8 }),
    gaReport(env, prop, { dateRanges: one, dimensions: m('sessionSourceMedium'), metrics: m('sessions'), dimensionFilter: host, orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 8 }),
    gaReport(env, prop, { dateRanges: one, dimensions: m('pagePath'), metrics: m('screenPageViews'), dimensionFilter: host, orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: 8 }),
    sc(r.sc.current),
    sc(r.sc.previous),
    sc(r.sc.current, { dimensions: ['query'], rowLimit: 10 }),
    sc(r.sc.current, { dimensions: ['date'], rowLimit: 400 }),
    sc(r.sc.previous, { dimensions: ['date'], rowLimit: 400 }),
    salesSection(env, r, period, allTime, mapPromise)
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
      const d = parseDailyRanges(daily.value, r.current, r.previous);
      const any = d.current.some((p) => p.value > 0) || d.previous.some((p) => p.value > 0);
      body += `<section class="card card__pad grid-2--gap">${any
        ? chart({ series: d.current, prev: d.previous, label: `Bezoekers per dag, ${rangeLabel(r.current)}`, title: 'Bezoekers per dag' })
        : emptyChart('Bezoekers per dag', 'Nog geen bezoek in deze periode. Een nieuwe koppeling kan tot een dag duren voor er cijfers zijn.')}</section>`;
    }
    const channelList = channels.status === 'fulfilled' ? parseList(channels.value, 8) : [];
    const sourceList = sources.status === 'fulfilled' ? parseList(sources.value, 8) : [];
    const pageList = pages.status === 'fulfilled' ? parseList(pages.value, 8) : [];
    body += `<div class="grid-2 grid-2--gap"><section class="card card__pad"><h2>Waar komen bezoekers vandaan?</h2>${rankList(channelList, 'Nog geen gegevens.', channelLabel)}</section>
<section class="card card__pad"><h2>Bronnen</h2>${rankList(sourceList, 'Nog geen gegevens.')}</section></div>
<section class="card card__pad grid-2--gap"><h2>Best bezochte pagina's</h2>${rankList(pageList, 'Nog geen gegevens.', pageLabel)}</section>`;
  }

  // Verkoop, naast het bezoek te bekijken
  body += sales.status === 'fulfilled' ? sales.value : '';

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
    if (scDayNow.status === 'fulfilled') {
      const now = parseScDaily(scDayNow.value, r.sc.current);
      const before = scDayPrev.status === 'fulfilled' ? parseScDaily(scDayPrev.value, r.sc.previous) : null;
      const any = now.some((p) => p.value > 0) || (before && before.some((p) => p.value > 0));
      body += `<section class="card card__pad grid-2--gap">${any
        ? chart({ series: now, prev: before, label: `Klikken vanuit Google per dag, ${rangeLabel(r.sc.current)}`, title: 'Klikken vanuit Google per dag' })
        : emptyChart('Klikken vanuit Google per dag', 'Nog geen klikken. Een nieuwe site heeft even tijd nodig voor Google hem toont.')}</section>`;
    }
    body += queries.length
      ? `<section class="card table-wrap grid-2--gap"><table class="table"><thead><tr><th scope="col">Zoekterm</th><th scope="col" class="num">Klikken</th><th scope="col" class="num">Vertoningen</th><th scope="col" class="num">Klikpercentage</th><th scope="col" class="num">Positie</th></tr></thead><tbody>${queries.map((q) => `<tr><td class="c-main">${esc(q.query)}</td><td class="num tnum c-wide" data-label="Klikken:">${nf(q.clicks)}</td><td class="num tnum c-wide" data-label="Vertoningen:">${nf(q.impressions)}</td><td class="num tnum c-wide" data-label="Klikpercentage:">${pct(q.ctr)}</td><td class="num tnum c-wide" data-label="Positie:">${pos(q.position)}</td></tr>`).join('')}</tbody></table></section>`
      : '<section class="card card__pad grid-2--gap"><p class="muted">Nog geen zoektermen. Search Console loopt een paar dagen achter en een nieuwe site heeft even tijd nodig voor Google hem toont.</p></section>';
    body += `<p class="note">Search Console loopt twee tot drie dagen achter (${esc(rangeLabel(r.sc.current))}).</p>`;
  }
  return layout('Analytics', body, { user, csrf, active: 'analytics', counts, maps: mapsOption(body, env) });
}
