const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });

/** Money is carried as integer paise end-to-end and only formatted for display. */
export const formatPaise = (paise: number) => inr.format(paise / 100);

const dateTime = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
export const formatDateTimeIST = (d: Date) => dateTime.format(d);

const dateOnly = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "UTC" });
/** Formats a YYYY-MM-DD calendar date (no timezone shifting). */
export const formatLocalDate = (ymd: string) => dateOnly.format(new Date(`${ymd}T00:00:00Z`));
