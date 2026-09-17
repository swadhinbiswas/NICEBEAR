-- NiceBear is free forever: no Stripe, no billing, no paid plans.
-- Drops the never-populated Stripe tables from 0001. Donations (optional)
-- are a plain outbound link (DONATE_URL), not a data model.
DROP TABLE IF EXISTS subscriptions;
--> statement-breakpoint
DROP TABLE IF EXISTS invoices;
