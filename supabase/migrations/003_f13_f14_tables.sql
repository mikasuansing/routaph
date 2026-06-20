-- F13: service disruptions (admin/community-flagged line outages)
CREATE TABLE IF NOT EXISTS service_disruptions (
  id          bigserial PRIMARY KEY,
  corridor_id bigint REFERENCES corridors(id) ON DELETE CASCADE,
  start_at    timestamptz NOT NULL DEFAULT now(),
  end_at      timestamptz,              -- NULL = still active
  description text        NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE service_disruptions ENABLE ROW LEVEL SECURITY;

-- Anyone can read active disruptions
CREATE POLICY "public read disruptions"
  ON service_disruptions FOR SELECT
  USING (true);

-- Only service-role (admin) can write
CREATE POLICY "service role insert disruptions"
  ON service_disruptions FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service role update disruptions"
  ON service_disruptions FOR UPDATE
  USING (auth.role() = 'service_role');

-- F14: ride-hailing provider catalogue
CREATE TABLE IF NOT EXISTS ride_providers (
  id                 bigserial PRIMARY KEY,
  name               text NOT NULL,
  deep_link_template text NOT NULL   -- placeholders: {originLat},{originLng},{destLat},{destLng}
);

ALTER TABLE ride_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read providers"
  ON ride_providers FOR SELECT
  USING (true);

-- Per-provider fare rules (ESTIMATES ONLY — verify against ltfrb.gov.ph before production)
CREATE TABLE IF NOT EXISTS provider_fare_rules (
  id          bigserial PRIMARY KEY,
  provider_id bigint REFERENCES ride_providers(id) ON DELETE CASCADE,
  base_fare   numeric(8,2) NOT NULL,
  per_km      numeric(8,2) NOT NULL,
  currency    text NOT NULL DEFAULT 'PHP'
);

ALTER TABLE provider_fare_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read fare rules"
  ON provider_fare_rules FOR SELECT
  USING (true);

-- Seed: provider catalogue and approximate 2024 NCR rates
-- IMPORTANT: These are estimates. Verify current rates before production deployment.
-- Grab rates: approximately ₱105 base + ₱15/km (subject to surge pricing)
-- JoyRide: approximately ₱60 base + ₱11/km (motorcycle taxi)
INSERT INTO ride_providers (name, deep_link_template) VALUES
  ('Grab Car',
   'https://grab.com/ride/?origin={originLat},{originLng}&destination={destLat},{destLng}'),
  ('JoyRide Motorcycle',
   'https://joyrideph.com/?from={originLat},{originLng}&to={destLat},{destLng}')
ON CONFLICT DO NOTHING;

INSERT INTO provider_fare_rules (provider_id, base_fare, per_km) VALUES
  (1, 105.00, 15.00),
  (2,  60.00, 11.00)
ON CONFLICT DO NOTHING;
