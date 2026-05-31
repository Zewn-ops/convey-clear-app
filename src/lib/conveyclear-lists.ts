// ============================================================================
// Canonical ConveyClear value lists — from MASTER_DIRECTORY.md (2026-05-31).
// Single source for form dropdowns + future Pipedrive sync. Keep in sync with
// `cc-notes and stuff/MASTER_DIRECTORY.md`.
// ============================================================================

export const PERSON_INDUSTRIES = [
  "Unknown",
  "Agriculture & Forestry",
  "Mining & Quarrying",
  "Oil & Gas Extraction",
  "Fishing & Hunting",
  "Construction & Infrastructure",
  "Automotive & Transport Equipment",
  "Aerospace & Defense",
  "Chemicals & Pharmaceuticals",
  "Textiles & Apparel",
  "Electronics & Semiconductors",
  "Food & Beverage Production",
  "Retail & Consumer Goods",
  "Hospitality, Tourism & Travel",
  "Finance, Banking & Insurance",
  "Real Estate & Property Services",
  "Legal & Professional Services",
  "Education & Training",
  "Healthcare & Life Sciences",
  "Media, Entertainment & Arts",
  "Information Technology & Software",
  "Telecommunications",
  "Energy & Utilities (Electricity, Water, Waste)",
  "Logistics, Shipping & Supply Chain",
  "E-commerce",
  "Government & Public Administration",
  "Non-Profit & Social Services",
  "Public Safety & Emergency Services",
] as const;

export const PERSON_DESIGNATIONS = [
  "Conveyancer / Partner",
  "Paralegal / Legal Secretary",
  "Real Estate Agent",
  "Property Manager",
  "Business Owner / Director",
  "Store Manager",
  "Compliance / Health & Safety Officer",
  "PIC (Person in Charge)",
  "Accounts Payable / Creditors",
  "Financial Manager / CFO",
  "Admin / Office Manager",
  "Architect / Draftsperson",
  "Town Planner",
  "Sub-Contractor (Master Electrician, Plumber, etc.)",
  "Health Inspector (EHS)",
  "Building Inspector",
  "Utility / Billing Clerk",
  "Attorney",
  "Developer",
  "Contractor",
  "Council Official",
] as const;

export const PERSON_LABELS = [
  "Real Estate Agent",
  "Attorney",
  "Developer",
  "Contractor",
  "Council Official",
  "Individual",
  "Business Owner",
  "Seller",
  "Buyer",
] as const;

export const ORGANISATION_LABELS = [
  "Real Estate Agency",
  "Law Firm",
  "Commercial Property",
  "Local Government",
] as const;

export const DEAL_SOURCE_CHANNELS = [
  "Website",
  "Refered",
  "Networking",
  "Email",
  "Cold Call",
] as const;

export const DEAL_LABELS = [
  "Priority",
  "Complex",
  "Emerging",
  "Urgent",
  "Standard",
  "Whale",
] as const;

export const MUNICIPALITIES = [
  "COT",
  "COJ",
  "COE",
  "CPT",
  "Emakhazeni",
  "Mogale City",
  "Emfuleni",
  "Rand West Municipality",
  "eMalahleni",
  "Other",
] as const;

// Master primary services (service lines). Sub-types live under each.
export const PRIMARY_SERVICES = [
  "Business Compliance",
  "Municipal Account Dispute",
  "Change of Ownership",
  "Refund",
  "Existing Building Plans",
  "Property Rates Clearance",
] as const;

export type PersonIndustry = (typeof PERSON_INDUSTRIES)[number];
export type PersonDesignation = (typeof PERSON_DESIGNATIONS)[number];
