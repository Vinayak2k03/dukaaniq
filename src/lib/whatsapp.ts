const DEFAULT_COUNTRY_CODE = "91";

/** Digits-only international number for wa.me, or null when it cannot be a valid mobile number. 10-digit numbers are assumed Indian. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) digits = DEFAULT_COUNTRY_CODE + digits;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

/** Opens a chat with the message prefilled; the shop owner taps Send in their own WhatsApp. */
export function whatsappLink(phone: string | null | undefined, message: string): string | null {
  const n = normalizePhone(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(message)}` : null;
}
