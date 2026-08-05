-- ============================================================================
-- 050 — transfer_parties: everyone with a role in the transaction
-- ============================================================================
-- Section 1, P2. INERT: the table is created and backfilled, and the app keeps
-- reading property_transfers.{seller,buyer}_client_id until its own deploy.
-- The old columns are NOT dropped.
--
-- WHY
--   Zewn parked two asks on 2026-07-28 because they needed a schema decision:
--   "parties on property transfers (create-or-link buyer/seller/estate agents/
--   attorneys)" and "client profiles more present in creation flows". Both were
--   blocked on this table. A transfer currently holds four scattered FKs —
--   seller_client_id, buyer_client_id, business_partner_id,
--   estate_agent_partner_id — which means the shape of a transaction is fixed
--   at exactly one of each and nothing else can be recorded.
--
-- THREE WAYS TO IDENTIFY A PARTY, exactly one per row:
--   client_id   an ENTITY (a clients row) — a person, business or trust
--   firm_id     a FIRM (a firms row) — an attorney or estate-agency practice
--   inline      captured by hand, for a party with no record yet
--
-- ⚠️ DELIBERATELY NOT REPEATING matter_parties' chk_party_name. That constraint
-- requires a name even when the row links to a client, which is why the
-- 2026-07-28 COO fix had to seed uncaptured sides with the literal string
-- "Seller" — a real name field that a council pack would have printed. Here a
-- linked row takes its name from what it links to, and only an inline row must
-- carry one.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.transfer_parties (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id  uuid NOT NULL REFERENCES public.property_transfers(id) ON DELETE CASCADE,

  -- Conveyancing roles. Wider than matter_parties on purpose: agents and the
  -- various attorneys are exactly what could not be recorded before.
  role text NOT NULL CHECK (role IN (
    'seller',
    'buyer',
    'estate_agent',
    'conveyancing_attorney',
    'bond_attorney',
    'cancellation_attorney',
    'other'
  )),

  -- Exactly one of these two, or neither for an inline capture.
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  firm_id   uuid REFERENCES public.firms(id)   ON DELETE SET NULL,

  -- Inline capture. Only required when the row links to nothing.
  entity_type      text CHECK (entity_type IN ('natural_person','business','trust')),
  full_name        text,
  business_name    text,
  registration_no  text,
  id_number        text,
  email            text,
  cell             text,
  physical_address text,

  notes      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- A party is a link OR a capture, never both and never neither.
  CONSTRAINT transfer_parties_one_identity CHECK (
    (client_id IS NOT NULL AND firm_id IS NULL)
 OR (firm_id   IS NOT NULL AND client_id IS NULL)
 OR (client_id IS NULL AND firm_id IS NULL
     AND entity_type IS NOT NULL
     AND coalesce(nullif(btrim(full_name), ''), nullif(btrim(business_name), '')) IS NOT NULL)
  ),

  -- One seller and one buyer per transfer. Agents and attorneys may repeat:
  -- a transaction can genuinely have a bond attorney and a cancellation
  -- attorney, or co-agents.
  CONSTRAINT transfer_parties_unique_principal UNIQUE (transfer_id, role, client_id, firm_id)
);

COMMENT ON TABLE public.transfer_parties IS
  'PARTY — a role played on a property transfer. Identified by exactly one of: '
  'client_id (an ENTITY), firm_id (a FIRM), or an inline capture. Glossary '
  'locked 2026-08-04: Entity / Firm / Member / Party.';

CREATE INDEX IF NOT EXISTS idx_transfer_parties_transfer ON public.transfer_parties (transfer_id);
CREATE INDEX IF NOT EXISTS idx_transfer_parties_client   ON public.transfer_parties (client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transfer_parties_firm     ON public.transfer_parties (firm_id)   WHERE firm_id IS NOT NULL;

-- Only one seller and one buyer per transfer, however they are identified.
CREATE UNIQUE INDEX IF NOT EXISTS transfer_parties_one_seller
  ON public.transfer_parties (transfer_id) WHERE role = 'seller';
CREATE UNIQUE INDEX IF NOT EXISTS transfer_parties_one_buyer
  ON public.transfer_parties (transfer_id) WHERE role = 'buyer';

DROP TRIGGER IF EXISTS trg_transfer_parties_updated_at ON public.transfer_parties;
CREATE TRIGGER trg_transfer_parties_updated_at
  BEFORE UPDATE ON public.transfer_parties
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Backfill from the four scattered FKs. Idempotent.
-- ---------------------------------------------------------------------------
INSERT INTO public.transfer_parties (transfer_id, role, client_id)
SELECT t.id, 'seller', t.seller_client_id FROM public.property_transfers t
 WHERE t.seller_client_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.transfer_parties (transfer_id, role, client_id)
SELECT t.id, 'buyer', t.buyer_client_id FROM public.property_transfers t
 WHERE t.buyer_client_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- The firm handling the transfer is a party to it, not just an owner column.
INSERT INTO public.transfer_parties (transfer_id, role, firm_id)
SELECT t.id, 'conveyancing_attorney', t.business_partner_id FROM public.property_transfers t
 WHERE t.business_partner_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.transfer_parties (transfer_id, role, firm_id)
SELECT t.id, 'estate_agent', t.estate_agent_partner_id FROM public.property_transfers t
 WHERE t.estate_agent_partner_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- RLS — routed through can_access_transfer(), so this table inherits exactly
-- the transfer's own visibility rules and cannot drift from them.
-- ---------------------------------------------------------------------------
ALTER TABLE public.transfer_parties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS transfer_parties_staff_all ON public.transfer_parties;
CREATE POLICY transfer_parties_staff_all ON public.transfer_parties FOR ALL TO authenticated
  USING (app_is_staff()) WITH CHECK (app_is_staff());

DROP POLICY IF EXISTS transfer_parties_read ON public.transfer_parties;
CREATE POLICY transfer_parties_read ON public.transfer_parties FOR SELECT TO authenticated
  USING (public.can_access_transfer(transfer_id));

-- The firm working a transfer captures its parties, so writes follow the same
-- rule as reads rather than being staff-only.
DROP POLICY IF EXISTS transfer_parties_write ON public.transfer_parties;
CREATE POLICY transfer_parties_write ON public.transfer_parties FOR INSERT TO authenticated
  WITH CHECK (public.can_access_transfer(transfer_id));

DROP POLICY IF EXISTS transfer_parties_update ON public.transfer_parties;
CREATE POLICY transfer_parties_update ON public.transfer_parties FOR UPDATE TO authenticated
  USING (public.can_access_transfer(transfer_id))
  WITH CHECK (public.can_access_transfer(transfer_id));

DROP POLICY IF EXISTS transfer_parties_delete ON public.transfer_parties;
CREATE POLICY transfer_parties_delete ON public.transfer_parties FOR DELETE TO authenticated
  USING (public.can_access_transfer(transfer_id));

COMMIT;

-- ============================================================================
-- VERIFY (run after COMMIT)
--
--   -- the backfill reproduces every existing FK
--   SELECT
--     (SELECT count(*) FROM property_transfers WHERE seller_client_id IS NOT NULL) AS sellers,
--     (SELECT count(*) FROM transfer_parties WHERE role='seller')                  AS seller_rows,
--     (SELECT count(*) FROM property_transfers WHERE buyer_client_id IS NOT NULL)  AS buyers,
--     (SELECT count(*) FROM transfer_parties WHERE role='buyer')                   AS buyer_rows,
--     (SELECT count(*) FROM property_transfers WHERE business_partner_id IS NOT NULL) AS firms,
--     (SELECT count(*) FROM transfer_parties WHERE role='conveyancing_attorney')   AS firm_rows;
--   -- each pair must match
--
--   -- the identity constraint actually bites
--   INSERT INTO transfer_parties (transfer_id, role) SELECT id,'other' FROM property_transfers LIMIT 1;
--   -- expect: violates transfer_parties_one_identity
--
--   -- one seller per transfer
--   INSERT INTO transfer_parties (transfer_id, role, client_id)
--     SELECT transfer_id, 'seller', client_id FROM transfer_parties WHERE role='seller' LIMIT 1;
--   -- expect: violates transfer_parties_one_seller
--
-- ROLLBACK
--   DROP TABLE IF EXISTS public.transfer_parties;
--   -- the four FK columns on property_transfers were never modified.
-- ============================================================================
