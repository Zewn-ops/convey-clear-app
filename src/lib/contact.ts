// ConveyClear contact details. Hardcoded real values (env override optional).
// +27 79 220 0556 is the ONLY number clients should ever call.
export const CONVEYCLEAR_PHONE = process.env.NEXT_PUBLIC_CONVEYCLEAR_PHONE ?? "+27 79 220 0556";
export const CONVEYCLEAR_EMAIL = process.env.NEXT_PUBLIC_CONVEYCLEAR_EMAIL ?? "services@conveyclear.co.za";

export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}
