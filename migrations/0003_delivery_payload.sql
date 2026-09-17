-- Store the event payload with the delivery row so Queue consumers, retries,
-- and the self-host drain route all deliver identical bytes (and signatures).
ALTER TABLE webhook_deliveries ADD COLUMN payload TEXT;
