-- Fix: dezelfde soort fout als in 0002, maar dan voor de tabellen die de Worker rechtstreeks
-- beschrijft zonder tussenliggende functie (business_requests nu, payment_events straks in fase 2).
-- service_role bypasst RLS, maar dat is een aparte laag dan de gewone tabelrechten (GRANT) - zonder
-- expliciete grant geeft PostgREST alsnog "permission denied", zoals bevestigd op de preview
-- (business_request_failed 500 -> "permission denied for table business_requests").
grant select, insert, update, delete on public.orders, public.order_lines, public.business_requests, public.payment_events to service_role;
