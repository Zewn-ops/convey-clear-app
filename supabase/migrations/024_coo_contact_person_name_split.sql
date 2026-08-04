-- 024_coo_contact_person_name_split.sql
-- A&A demo punch-list #6: the business / trust CONTACT PERSON on a party was a
-- single `contact_name`, while the rest of the portal (natural persons) uses
-- first_name + last_name since migration 023. Split the contact person too.
--
-- Adds contact_first_name / contact_last_name to matter_parties and backfills
-- them from the existing contact_name (first token → first name, remainder →
-- surname; single-word names go to first name only). The legacy contact_name
-- column is RETAINED (deprecated) for rollback safety — drop it in a later
-- migration once the split is confirmed in production.
--
-- Safe to run before deploying the code: reads use select('*') so the new
-- columns are simply absent until this runs; the code writes/reads first/last
-- with a fallback to contact_name.

alter table matter_parties
  add column if not exists contact_first_name text,
  add column if not exists contact_last_name  text;

update matter_parties
set
  contact_first_name = case
    when position(' ' in trim(contact_name)) > 0
      then nullif(trim(split_part(trim(contact_name), ' ', 1)), '')
    else nullif(trim(contact_name), '')
  end,
  contact_last_name = case
    when position(' ' in trim(contact_name)) > 0
      then nullif(trim(substring(trim(contact_name) from position(' ' in trim(contact_name)) + 1)), '')
    else null
  end
where contact_name is not null
  and trim(contact_name) <> ''
  and contact_first_name is null
  and contact_last_name is null;

comment on column matter_parties.contact_name is
  'DEPRECATED (migration 024): superseded by contact_first_name + contact_last_name. Retained for rollback; drop in a later migration.';
