export const todayISO = () => new Date().toISOString().slice(0, 10);
export const toISO = (d: Date) => d.toISOString().slice(0, 10);
export const daysUntil = (iso: string) => {
  const target = new Date(iso + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / 86400000);
};
export const addDaysISO = (iso: string, days: number) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toISO(d);
};
