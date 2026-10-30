/**
 * Static festival calendar (no external API). Dates are local Asia/Kolkata calendar days, inclusive.
 * Past 2026 entries are kept so festival weeks inside the sales data can be compared with a baseline.
 * Lunar festival dates shift every year: edit this list as needed.
 */

// TODO: verify dates against an official panchang / gazetted holiday list before each season.

export type Festival = { key: string; name: string; startDate: string; endDate: string; relevantCategories: string[] };

const FOOD = ["Staples", "Snacks", "Beverages", "Packaged Food", "Dairy"];

export const FESTIVALS: Festival[] = [
  // Inside the demo data window (used for uplift comparisons).
  { key: "raksha-bandhan-2026", name: "Raksha Bandhan", startDate: "2026-08-26", endDate: "2026-08-28", relevantCategories: ["Snacks", "Packaged Food", "Personal Care"] },
  { key: "ganesh-chaturthi-2026", name: "Ganesh Chaturthi", startDate: "2026-09-12", endDate: "2026-09-14", relevantCategories: ["Staples", "Dairy", "Snacks"] },
  { key: "navratri-dussehra-2026", name: "Navratri & Dussehra", startDate: "2026-10-11", endDate: "2026-10-20", relevantCategories: ["Staples", "Dairy", "Packaged Food"] },

  // November 2026 to October 2027.
  { key: "diwali-2026", name: "Dhanteras & Diwali", startDate: "2026-11-06", endDate: "2026-11-11", relevantCategories: [...FOOD, "Household", "Personal Care"] },
  { key: "chhath-2026", name: "Chhath Puja", startDate: "2026-11-14", endDate: "2026-11-16", relevantCategories: ["Staples", "Dairy", "Packaged Food"] },
  { key: "christmas-2026", name: "Christmas", startDate: "2026-12-23", endDate: "2026-12-25", relevantCategories: ["Snacks", "Beverages", "Packaged Food", "Dairy"] },
  { key: "new-year-2027", name: "New Year", startDate: "2026-12-30", endDate: "2027-01-01", relevantCategories: ["Snacks", "Beverages", "Packaged Food"] },
  { key: "sankranti-2027", name: "Lohri, Makar Sankranti & Pongal", startDate: "2027-01-13", endDate: "2027-01-15", relevantCategories: ["Staples", "Snacks", "Dairy"] },
  { key: "eid-ul-fitr-2027", name: "Eid ul-Fitr", startDate: "2027-03-09", endDate: "2027-03-10", relevantCategories: ["Staples", "Dairy", "Packaged Food", "Beverages"] },
  { key: "holi-2027", name: "Holi", startDate: "2027-03-20", endDate: "2027-03-22", relevantCategories: ["Snacks", "Beverages", "Personal Care", "Dairy"] },
  { key: "eid-ul-adha-2027", name: "Eid ul-Adha", startDate: "2027-05-16", endDate: "2027-05-17", relevantCategories: ["Staples", "Dairy", "Packaged Food"] },
  { key: "raksha-bandhan-2027", name: "Raksha Bandhan", startDate: "2027-08-15", endDate: "2027-08-17", relevantCategories: ["Snacks", "Packaged Food", "Personal Care"] },
  { key: "ganesh-chaturthi-2027", name: "Ganesh Chaturthi", startDate: "2027-09-02", endDate: "2027-09-04", relevantCategories: ["Staples", "Dairy", "Snacks"] },
  { key: "navratri-dussehra-2027", name: "Navratri & Dussehra", startDate: "2027-09-30", endDate: "2027-10-09", relevantCategories: ["Staples", "Dairy", "Packaged Food"] },
];

/** Festivals whose first day is `minDays`..`maxDays` days after the reference date. */
export const upcomingFestivals = (list: Festival[], ref: string, daysUntil: (f: Festival) => number, minDays = 3, maxDays = 21) =>
  list.filter((f) => daysUntil(f) >= minDays && daysUntil(f) <= maxDays).sort((a, b) => a.startDate.localeCompare(b.startDate));
