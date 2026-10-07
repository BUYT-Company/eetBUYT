// Stijl van het beheer (zie docs/ontwerp-beheerportaal.md §5): wit, rustig en ruim, Poldergroen als
// hoofdkleur, Lentelimoen alleen voor de ene hoofdactie per scherm, DM Sans overal. Wordt door de
// Worker uitgeleverd op /admin/admin.css (geen inline stijl, zodat de Content-Security-Policy strikt kan zijn).
export default `
@font-face { font-family: "DM Sans"; src: url("/assets/fonts/dm-sans-latin.woff2") format("woff2"); font-weight: 100 1000; font-style: normal; font-display: swap; }

:root {
  --green: #007F4F;
  --green-700: #066441;
  --green-50: #EAF4EE;
  --lime: #D8ED36;
  --lime-600: #C8DE22;
  --coral: #FF6652;
  --ink: #123326;
  --muted: #4D6456;
  --line: #E3E8E4;
  --line-strong: #C7D0CA;
  --wash: #F6F8F6;
  --danger: #B3261E;
  --radius: 16px;
  --side-w: 236px;
  --font: "DM Sans", system-ui, -apple-system, "Segoe UI", Arial, sans-serif;
}
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: #fff; color: var(--ink); font: 400 15px/1.5 var(--font); }
a { color: var(--green); text-underline-offset: 3px; }
a:hover { color: var(--green-700); }
h1, h2, h3 { margin: 0; font-weight: 500; letter-spacing: -.015em; line-height: 1.2; text-wrap: balance; }
h1 { font-size: 1.625rem; }
h2 { font-size: 1.0625rem; }
p { margin: 0; text-wrap: pretty; }
small, .muted { color: var(--muted); }
:focus-visible { outline: 2px solid var(--green); outline-offset: 2px; border-radius: 6px; }
::selection { background: var(--lime); color: var(--ink); }
.skip { position: absolute; left: -9999px; top: 8px; background: var(--ink); color: #fff; padding: 8px 14px; border-radius: 999px; z-index: 100; }
.skip:focus { left: 8px; }
.tnum { font-variant-numeric: tabular-nums; }
.sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

/* Indeling: vaste balk links op laptop, tabbalk onderaan op telefoon */
.app { min-height: 100vh; }
.side { position: fixed; inset: 0 auto 0 0; width: var(--side-w); display: none; flex-direction: column; padding: 22px 14px 18px; border-right: 1px solid var(--line); background: #fff; }
.brand { display: flex; align-items: center; gap: 10px; padding: 0 10px 22px; text-decoration: none; color: var(--ink); font-weight: 600; letter-spacing: -.02em; font-size: 1.05rem; }
.brand img { width: 34px; height: auto; display: block; }
.brand small { font-weight: 400; letter-spacing: 0; }
.nav { display: grid; gap: 2px; }
.nav a { display: flex; align-items: center; gap: 11px; padding: 10px 12px; border-radius: 12px; color: var(--muted); text-decoration: none; font-weight: 500; }
.nav a:hover { background: var(--wash); color: var(--ink); }
.nav a[aria-current="page"] { background: var(--green-50); color: var(--green); }
.nav svg { width: 20px; height: 20px; flex: none; }
.count { margin-left: auto; min-width: 22px; padding: 1px 7px; border-radius: 999px; background: var(--coral); color: var(--ink); font-size: .75rem; font-weight: 700; text-align: center; }
.side__foot { margin-top: auto; padding: 14px 10px 0; border-top: 1px solid var(--line); display: grid; gap: 8px; font-size: .875rem; }
.side__foot .who { font-weight: 500; }
.linklike { appearance: none; background: none; border: 0; padding: 0; font: inherit; color: var(--muted); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; text-align: left; }
.linklike:hover { color: var(--ink); }

.top { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--line); position: sticky; top: 0; background: #fff; z-index: 20; }
.top .brand { padding: 0; }
.tabbar { position: fixed; inset: auto 0 0 0; display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; background: #fff; border-top: 1px solid var(--line); z-index: 20; padding-bottom: env(safe-area-inset-bottom); }
.tabbar a { display: grid; justify-items: center; gap: 2px; padding: 8px 4px 9px; min-height: 56px; color: var(--muted); text-decoration: none; font-size: .75rem; font-weight: 500; position: relative; }
.tabbar a[aria-current="page"] { color: var(--green); }
.tabbar svg { width: 22px; height: 22px; }
.tabbar .count { position: absolute; top: 4px; left: calc(50% + 6px); margin: 0; }

.main { padding: 22px 16px 96px; max-width: 1180px; }
.page-head { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 12px 24px; margin-bottom: 22px; }
.page-head p { color: var(--muted); margin-top: 4px; }
.back { display: inline-flex; margin-bottom: 14px; color: var(--muted); font-size: .875rem; text-decoration: none; }
.back:hover { color: var(--ink); }

@media (min-width: 900px) {
  .side { display: flex; }
  .top, .tabbar { display: none; }
  /* Maximaal 1180px breed en gecentreerd in de ruimte rechts van het menu (procenten in een marge verwijzen naar de breedte van de pagina). */
  .main { margin-left: calc(var(--side-w) + max(0px, (100% - var(--side-w) - 1180px) / 2)); padding: 40px clamp(28px, 4vw, 56px) 80px; }
}

/* Knoppen: één limoenknop per scherm, de rest rustig */
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 0 20px; border-radius: 999px; border: 1px solid var(--line-strong); background: #fff; color: var(--ink); font: 500 .9375rem/1 var(--font); text-decoration: none; cursor: pointer; transition: background-color .18s ease, border-color .18s ease, transform .18s ease; }
.btn:hover { background: var(--wash); border-color: var(--ink); color: var(--ink); }
.btn:active { transform: translateY(1px); }
.btn--primary { background: var(--lime); border-color: var(--lime); font-weight: 600; }
.btn--primary:hover { background: var(--lime-600); border-color: var(--lime-600); }
.btn--sm { min-height: 36px; padding: 0 14px; font-size: .875rem; }
.btn--block { width: 100%; }
.btn[disabled], .btn[aria-disabled="true"] { opacity: .45; cursor: not-allowed; pointer-events: none; }
.btn--danger { color: var(--danger); border-color: #E7C4C1; }
.btn--danger:hover { background: #FDF3F2; border-color: var(--danger); color: var(--danger); }

/* Formulieren */
label { display: block; font-weight: 500; font-size: .875rem; margin-bottom: 6px; }
.input, select, textarea { width: 100%; min-height: 44px; padding: 10px 14px; border: 1px solid var(--line-strong); border-radius: 12px; background: #fff; color: var(--ink); font: inherit; }
textarea { min-height: 88px; resize: vertical; }
.input:hover, select:hover, textarea:hover { border-color: var(--muted); }
.input:focus, select:focus, textarea:focus { outline: 2px solid var(--green); outline-offset: 0; border-color: var(--green); }
.field { display: grid; gap: 0; }
.hint { color: var(--muted); font-size: .8125rem; margin-top: 6px; }
.error { color: var(--danger); font-size: .875rem; font-weight: 500; }
.check { display: flex; gap: 10px; align-items: flex-start; font-weight: 400; margin: 0; }
.check input { width: 18px; height: 18px; margin-top: 2px; accent-color: var(--green); }

/* Kaarten en lijsten */
.card { border: 1px solid var(--line); border-radius: var(--radius); background: #fff; }
.card__pad { padding: 20px 22px; }
.card + .card { margin-top: 16px; }
.grid-2 > .card + .card, .stack > .card + .card { margin-top: 0; }
.card h2 { margin-bottom: 14px; }
.stack { display: grid; gap: 16px; }
.dl { display: grid; grid-template-columns: minmax(96px, auto) 1fr; gap: 8px 18px; margin: 0; }
.dl dt { color: var(--muted); }
.dl dd { margin: 0; overflow-wrap: anywhere; }

/* Statuslabels: kleur is nooit het enige signaal, de tekst staat er altijd bij */
.badge { display: inline-flex; align-items: center; gap: 7px; padding: 3px 11px 3px 9px; border-radius: 999px; background: var(--wash); border: 1px solid var(--line); font-size: .8125rem; font-weight: 500; white-space: nowrap; }
.badge::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--line-strong); }
.badge--nieuw::before { background: var(--coral); }
.badge--klaargemaakt::before { background: #8A9A90; }
.badge--onderweg::before { background: var(--lime); box-shadow: 0 0 0 1px #A9BC10; }
.badge--bezorgd::before { background: var(--green); }
.badge--geannuleerd { color: var(--muted); text-decoration: line-through; }
.badge--geannuleerd::before { background: var(--line-strong); }

/* Tabbladen */
.tabs { display: flex; gap: 4px; overflow-x: auto; border-bottom: 1px solid var(--line); margin-bottom: 18px; scrollbar-width: none; }
.tabs::-webkit-scrollbar { display: none; }
.tabs a { display: inline-flex; align-items: center; gap: 7px; padding: 10px 14px; color: var(--muted); text-decoration: none; font-weight: 500; white-space: nowrap; border-bottom: 2px solid transparent; margin-bottom: -1px; }
.tabs a:hover { color: var(--ink); }
.tabs a[aria-current="page"] { color: var(--green); border-bottom-color: var(--green); }
.tabs .n { color: var(--muted); font-weight: 400; font-size: .8125rem; }

.toolbar { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; }
.toolbar .input { flex: 1 1 240px; max-width: 420px; }

/* Tabel op laptop, kaarten op telefoon */
.table { width: 100%; border-collapse: collapse; }
.table th { text-align: left; font-weight: 500; font-size: .8125rem; color: var(--muted); padding: 12px 16px; border-bottom: 1px solid var(--line); background: #fff; }
.table td { padding: 14px 16px; border-bottom: 1px solid var(--line); vertical-align: middle; }
.table tr:last-child td { border-bottom: 0; }
.table tbody tr:hover td { background: var(--wash); }
.table a.row-link { font-weight: 600; text-decoration: none; }
.table .num { text-align: right; }
.cell-sub { display: block; color: var(--muted); font-size: .8125rem; }
.row-actions { display: flex; justify-content: flex-end; }
.table-wrap { overflow: hidden; }
@media (max-width: 899px) {
  .table, .table tbody, .table tr, .table td { display: block; width: 100%; }
  .table thead { position: absolute; left: -9999px; }
  .table tr { padding: 14px 16px; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; }
  .table tr:last-child { border-bottom: 0; }
  .table td { padding: 0; border: 0; }
  .table td[data-label]::before { content: attr(data-label) " "; color: var(--muted); font-size: .8125rem; }
  .table td.c-main { grid-column: 1 / 2; }
  .table td.c-status { grid-column: 2 / 3; grid-row: 1; justify-self: end; }
  .table td.c-wide { grid-column: 1 / -1; }
  .table td.c-act { grid-column: 1 / -1; margin-top: 8px; }
  .table td.num { text-align: left; }
  .row-actions { justify-content: stretch; }
  .row-actions form, .row-actions .btn { width: 100%; }
  .table tbody tr:hover td { background: transparent; }
}

/* Kleine hulpklassen (geen inline stijl: dat laat de Content-Security-Policy niet toe) */
.card__pad--head { padding-bottom: 6px; }
.page-head--section { margin-top: 34px; margin-bottom: 14px; }
.grid-2--gap { margin-top: 16px; }
.stack--note { margin-bottom: 20px; }
.btn--start { justify-self: start; }
.note--tight { margin: -8px 0 18px; }
.card--narrow { max-width: 640px; }
.field--section { margin-bottom: 22px; }
.toolbar--flat { margin: 0; }
.toolbar--flat .input { flex: 1 1 200px; }
.key--gap { margin: 8px 0 18px; }

/* Home */
.hello { margin-bottom: 26px; }
.hello p { color: var(--muted); margin-top: 4px; }
.todo { list-style: none; margin: 0; padding: 0; }
.todo li + li { border-top: 1px solid var(--line); }
.todo a { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 15px 22px; color: var(--ink); text-decoration: none; }
.todo a:hover { background: var(--wash); }
.todo svg { width: 18px; height: 18px; color: var(--muted); flex: none; }
.todo strong { font-weight: 600; }
.todo__empty { padding: 18px 22px; color: var(--muted); }
.period { display: inline-flex; padding: 3px; border: 1px solid var(--line); border-radius: 999px; background: #fff; }
.period a { padding: 6px 14px; border-radius: 999px; color: var(--muted); text-decoration: none; font-weight: 500; font-size: .875rem; }
.period a:hover { color: var(--ink); }
.period a[aria-current="page"] { background: var(--green); color: #fff; }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
.kpi { padding: 20px 22px; }
.kpi + .kpi { border-top: 1px solid var(--line); }
@media (min-width: 700px) { .kpi + .kpi { border-top: 0; border-left: 1px solid var(--line); } }
.kpi__label { color: var(--muted); font-size: .875rem; }
.kpi__value { font-size: 1.75rem; font-weight: 500; letter-spacing: -.02em; margin: 4px 0 6px; font-variant-numeric: tabular-nums; color: var(--green); }
.delta { font-size: .8125rem; font-weight: 500; font-variant-numeric: tabular-nums; }
.delta--up { color: var(--green-700); }
.delta--down { color: var(--danger); }
.delta--flat, .delta--none { color: var(--muted); font-weight: 400; }
.grid-2 { display: grid; gap: 16px; align-items: start; }
@media (min-width: 900px) { .grid-2 { grid-template-columns: 1fr 1fr; } }
.rank { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
.rank li { display: grid; gap: 6px; }
.rank__row { display: flex; justify-content: space-between; gap: 12px; }
.bar { appearance: none; -webkit-appearance: none; display: block; width: 100%; height: 6px; border: 0; border-radius: 999px; overflow: hidden; background: var(--green-50); color: var(--green); }
.bar::-webkit-progress-bar { background: var(--green-50); border-radius: 999px; }
.bar::-webkit-progress-value { background: var(--green); border-radius: 999px; }
.bar::-moz-progress-bar { background: var(--green); border-radius: 999px; }
.bar--split { height: 10px; margin: 12px 0 10px; background: var(--lime); }
.bar--split::-webkit-progress-bar { background: var(--lime); }
.dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 8px; }
.dot--new { background: var(--green); }
.dot--ret { background: var(--lime); box-shadow: 0 0 0 1px #A9BC10; }
.legend { display: flex; flex-wrap: wrap; gap: 8px 22px; font-size: .875rem; }
.note { color: var(--muted); font-size: .8125rem; margin-top: 12px; }

/* Bezorging */
.day { margin-bottom: 18px; overflow: hidden; }
.day__head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: 12px 24px; padding: 18px 22px; border-bottom: 1px solid var(--line); }
.day__head h2 { margin: 0 0 2px; font-size: 1.125rem; }
.day__head h2::first-letter { text-transform: uppercase; }
.slot { padding: 0 0 6px; }
.slot + .slot { border-top: 1px solid var(--line); }
.slot__head { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 16px 22px 8px; }
.slot__head h3 { margin: 0; font-size: 1rem; font-weight: 600; }
.stops { list-style: none; margin: 0; padding: 0 22px 8px; }
.stop { display: flex; gap: 14px; padding: 12px 0; border-top: 1px solid var(--line); }
.stop:first-child { border-top: 0; }
.stop__main { min-width: 0; flex: 1; }
.stop__top { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
.stop__line { overflow-wrap: anywhere; }
.stop__line a { color: var(--ink); text-decoration-color: var(--line-strong); }
.stop__line a:hover { color: var(--green); }
.stop__note { margin-top: 6px; padding: 8px 12px; border-radius: 10px; background: var(--wash); }
.stop--done .stop__main { opacity: .6; }
.check-btn { flex: none; width: 44px; height: 44px; display: grid; place-items: center; border-radius: 50%; border: 1.5px solid var(--line-strong); background: #fff; color: var(--line-strong); cursor: pointer; padding: 0; transition: background-color .18s ease, border-color .18s ease, color .18s ease; }
.check-btn:hover { border-color: var(--green); color: var(--green); background: var(--green-50); }
.check-btn svg { width: 22px; height: 22px; }
.check-btn--done { background: var(--green); border-color: var(--green); color: #fff; cursor: default; }
.share { display: grid; gap: 8px; justify-items: end; }
.share__list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; font-size: .8125rem; color: var(--muted); }
.share__list li { display: flex; gap: 12px; justify-content: flex-end; align-items: baseline; flex-wrap: wrap; }
.shared { max-width: 640px; margin: 0 auto; padding: 28px 18px 60px; }
.shared h1 { margin-bottom: 6px; }
@media (max-width: 899px) { .share { justify-items: start; } .share__list li { justify-content: flex-start; } }

/* Klanten, Berichten en Zakelijk */
.badge--c-new::before { background: var(--green); }
.badge--c-ret::before { background: var(--lime); box-shadow: 0 0 0 1px #A9BC10; }
.badge--r-nieuw::before { background: var(--coral); }
.badge--r-in_gesprek::before { background: #8A9A90; }
.badge--r-offerte_verstuurd::before { background: var(--lime); box-shadow: 0 0 0 1px #A9BC10; }
.badge--r-gewonnen::before, .badge--r-beantwoord::before { background: var(--green); }
.badge--r-verloren { color: var(--muted); }
.badge--r-verloren::before { background: var(--line-strong); }
.req__head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 10px; }
.req__head h2 { margin: 0 0 2px; }
.req__body { white-space: pre-line; margin-bottom: 14px; overflow-wrap: anywhere; }
.btn--ghost { border-color: transparent; color: var(--muted); }
.btn--ghost:hover { background: var(--wash); border-color: var(--line-strong); }
.more-out { margin-top: 18px; }

/* Analytics */
.section-h { margin: 34px 0 14px; font-size: 1.0625rem; }
.section-h:first-of-type { margin-top: 8px; }
.map { height: 440px; border-radius: 12px; background: var(--wash); overflow: hidden; }
.map__msg { margin: 0; padding: 24px; color: var(--muted); }
.dot--lime { background: var(--lime); box-shadow: 0 0 0 1px #6F8200; }
.dot--coral { background: var(--coral); box-shadow: 0 0 0 1px #B73A2A; }
.key-circle { display: inline-block; width: 18px; height: 12px; border: 2px solid var(--green); border-radius: 50%; background: rgba(0, 127, 79, .3); margin-right: 8px; vertical-align: middle; }
@media (max-width: 899px) { .map { height: 340px; } }
.chartbox { margin: 0; }
.subhead { margin: 0 0 4px; font-size: .9375rem; font-weight: 600; }
.note--top { margin: 0 0 12px; }
.cities__sum { margin: 0 0 18px; }
.period--small a { padding: 4px 12px; font-size: .8125rem; }
.rank__zero .rank__row { color: var(--muted); }
.chartbox__head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 6px 18px; margin-bottom: 12px; }
.chartbox__head h2 { margin: 0; }
.chart { display: block; width: 100%; height: auto; max-height: 340px; }
.chart--compact .chart__label { font-size: 15px; }
.chart__prev { fill: none; stroke: #8FA297; stroke-width: 2.5; stroke-linejoin: round; stroke-linecap: round; opacity: .85; }
.key-line { display: inline-block; width: 18px; height: 0; border-top: 2.5px solid #8FA297; margin-right: 8px; vertical-align: middle; }
.chart__bars rect { fill: var(--green); }
.chart__bars rect:hover { fill: var(--green-700); }
.chart__grid { stroke: var(--line); stroke-width: 1; }
.chart__axis { stroke: var(--line-strong); stroke-width: 1; }
.chart__label { fill: var(--muted); font: 400 11px var(--font); font-variant-numeric: tabular-nums; }
.steps { margin: 12px 0; padding-left: 1.2em; display: grid; gap: 8px; }
code { background: var(--wash); padding: 1px 6px; border-radius: 6px; font-size: .875em; }

/* Bestelling: detail */
.detail { display: grid; gap: 16px; align-items: start; }
@media (min-width: 1000px) { .detail { grid-template-columns: minmax(0, 1fr) 340px; } }
.actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.lines { width: 100%; border-collapse: collapse; }
.lines td { padding: 11px 0; border-bottom: 1px solid var(--line); vertical-align: top; }
.lines tr:last-child td { border-bottom: 0; }
.lines .r { text-align: right; white-space: nowrap; }
.total { display: flex; justify-content: space-between; gap: 12px; padding-top: 14px; margin-top: 4px; border-top: 1px solid var(--line-strong); font-weight: 600; }
details.more { border: 1px solid var(--line); border-radius: 12px; }
details.more summary { cursor: pointer; padding: 12px 16px; font-weight: 500; list-style: none; display: flex; justify-content: space-between; align-items: center; }
details.more summary::-webkit-details-marker { display: none; }
details.more summary::after { content: "+"; color: var(--muted); font-size: 1.2rem; line-height: 1; }
details.more[open] summary::after { content: "\\2212"; }
details.more .more__body { padding: 4px 16px 16px; display: grid; gap: 12px; }
.timeline { list-style: none; margin: 0; padding: 0; display: grid; gap: 0; }
.timeline li { position: relative; padding: 0 0 18px 22px; }
.timeline li::before { content: ""; position: absolute; left: 4px; top: 8px; bottom: -2px; width: 1px; background: var(--line); }
.timeline li:last-child { padding-bottom: 0; }
.timeline li:last-child::before { display: none; }
.timeline li::after { content: ""; position: absolute; left: 0; top: 6px; width: 9px; height: 9px; border-radius: 50%; background: #fff; border: 2px solid var(--line-strong); }
.timeline li.t-status::after { border-color: var(--green); }
.timeline .when { color: var(--muted); font-size: .8125rem; display: block; }
.timeline .by { color: var(--muted); }
.timeline .tnote { margin-top: 2px; background: var(--wash); border-radius: 10px; padding: 8px 12px; }

.flash { padding: 12px 16px; border-radius: 12px; background: var(--green-50); color: var(--green-700); font-weight: 500; margin-bottom: 18px; }
.flash--err { background: #FDF3F2; color: var(--danger); }

.empty { padding: 44px 24px; text-align: center; color: var(--muted); }
.empty h2 { color: var(--ink); margin-bottom: 6px; }

.pager { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; border-top: 1px solid var(--line); color: var(--muted); font-size: .875rem; }

/* Inloggen: wit, rustig, één kolom */
.auth { min-height: 100vh; display: grid; place-items: center; padding: 32px 20px; }
.auth__box { width: 100%; max-width: 380px; }
.auth__logo { display: flex; align-items: center; gap: 12px; margin-bottom: 36px; text-decoration: none; color: var(--ink); font-weight: 600; font-size: 1.25rem; letter-spacing: -.02em; }
.auth__logo img { width: 44px; height: auto; }
.auth h1 { font-size: 1.75rem; margin-bottom: 8px; }
.auth__lead { color: var(--muted); margin-bottom: 26px; }
.auth form { display: grid; gap: 18px; }
.otp { font-size: 1.5rem; letter-spacing: .5em; text-align: center; font-variant-numeric: tabular-nums; padding-left: calc(14px + .5em); }
.auth__foot { margin-top: 26px; color: var(--muted); font-size: .8125rem; }
.qr { width: 200px; height: 200px; margin: 6px 0 18px; }
.key { font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace; font-size: 1.05rem; letter-spacing: .06em; word-break: break-all; background: var(--wash); padding: 10px 12px; border-radius: 10px; display: block; }
pre.code { background: var(--wash); border-radius: 12px; padding: 12px 14px; font-size: .8125rem; overflow-x: auto; margin: 8px 0 0; }

@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
@media print { .side, .top, .tabbar { display: none; } .main { margin: 0; padding: 0; } }
`;
