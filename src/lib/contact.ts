// ConveyClear contact details. Set the real number in Vercel env
// (NEXT_PUBLIC_CONVEYCLEAR_PHONE) — until then the Call button falls back to email.
export const CONVEYCLEAR_PHONE = process.env.NEXT_PUBLIC_CONVEYCLEAR_PHONE ?? "";
export const CONVEYCLEAR_EMAIL = process.env.NEXT_PUBLIC_CONVEYCLEAR_EMAIL ?? "hello@conveyclear.co.za";

export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}
