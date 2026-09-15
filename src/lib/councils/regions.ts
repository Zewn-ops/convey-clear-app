/**
 * Suggested council regions, by council code.
 *
 * Jukka, 2026-09-15, asked for a region under the council on a property
 * transfer — "is it Lonehill, or is it Sandton, or is it Midrand" — so that
 * region-specific services are addressed to the right office.
 *
 * ⚠️ THIS IS A SUGGESTION LIST, NOT A TAXONOMY. Three COJ suburbs were named in
 * one meeting and nothing else has been agreed. In particular these are NOT the
 * official City of Johannesburg regions, which are lettered A–G; Jukka asked for
 * the suburb names his team actually uses, and encoding the official scheme
 * instead would be inventing a decision nobody made.
 *
 * The field is free text (097). These values populate a datalist, so a runner
 * gets one keystroke for the common case and can type anything for the rest.
 * When a real list arrives, extend this file — and only then consider whether a
 * constraint is worth adding.
 */
export const COUNCIL_REGION_SUGGESTIONS: Record<string, string[]> = {
  COJ: ["Sandton", "Midrand", "Lonehill", "Randburg", "Roodepoort", "Inner City"],
  // Named by nobody yet. An empty list means the input still accepts free text,
  // it just offers no suggestions — which is honest, where inventing Tshwane and
  // Ekurhuleni regions to fill the gap would not be.
  COT: [],
  COE: [],
};

/** Suggestions for a council, or none. Never throws on an unknown code. */
export function councilRegionSuggestions(municipality?: string | null): string[] {
  if (!municipality) return [];
  return COUNCIL_REGION_SUGGESTIONS[municipality.toUpperCase()] ?? [];
}
