-- Fix: create_order draaide als SECURITY INVOKER (de Postgres-standaard), dus met de rechten
-- van de aanroeper (service_role). RLS staat aan zonder policies, en service_role had geen
-- eigen grant op de tabellen, dus elke aanroep gaf "permission denied for table orders" nadat
-- de functie zelf al was toegestaan. SECURITY DEFINER laat hem draaien met de rechten van de
-- eigenaar (die de tabellen wél mag lezen/schrijven), wat hier veilig is: alleen service_role
-- mag deze functie ooit aanroepen (zie de revoke/grant in 0001_init.sql, die blijft staan).
alter function public.create_order(jsonb) security definer;
