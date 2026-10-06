// Klanten herkennen aan hun bestellingen (zie docs/ontwerp-beheerportaal.md §3): hetzelfde e-mailadres
// (hoofdletters negeren) óf hetzelfde telefoonnummer is dezelfde klant. Geen aparte klantentabel nodig.

// Telefoonnummers vergelijken op de laatste 9 cijfers, zodat +31 6 12345678 en 06-12345678 gelijk zijn.
// Te korte nummers tellen niet mee. Zelfde regel als norm_phone() in migratie 0006.
export function normPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 9 ? digits.slice(-9) : null;
}

const cents = (o) => o.total_final_cents ?? o.total_estimate_cents ?? 0;

// orders: rijen met order_number, customer_name, email, phone, city, status, created_at, totals.
// Geannuleerde bestellingen tellen niet mee. Nieuwste klant eerst in het resultaat.
export function groupCustomers(orders) {
  const live = orders.filter((o) => o.status !== 'geannuleerd');
  const parent = live.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (a, b) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent[rb] = ra; };

  const byKey = new Map();
  live.forEach((o, i) => {
    const keys = [o.email ? `e:${String(o.email).trim().toLowerCase()}` : null, normPhone(o.phone) ? `p:${normPhone(o.phone)}` : null];
    for (const k of keys) {
      if (!k) continue;
      if (byKey.has(k)) union(i, byKey.get(k)); else byKey.set(k, i);
    }
  });

  const groups = new Map();
  live.forEach((o, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(o);
  });

  const out = [...groups.values()].map((list) => {
    list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const latest = list[0];
    return {
      key: Math.min(...list.map((o) => Number(o.order_number))),
      name: latest.customer_name,
      email: latest.email,
      phone: latest.phone || '',
      city: latest.city || '',
      orders: list.length,
      totalCents: list.reduce((s, o) => s + cents(o), 0),
      firstAt: list[list.length - 1].created_at,
      lastAt: latest.created_at,
      lastOrderNumber: Number(latest.order_number),
      orderNumbers: list.map((o) => Number(o.order_number)),
      returning: list.length > 1
    };
  });
  return out.sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
}
