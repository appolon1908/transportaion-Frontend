/** Format major-unit amounts; tender rates are already expressed in these units. */
export const money = (value: string | number | undefined, currency = "USD"): string =>
  new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(value ?? 0));

/** Settlement total_minor uses the API's hundredths-of-a-unit representation. */
export const minorMoney = (value: string | number, currency = "USD"): string =>
  money(Number(value) / 100, currency);

/** datetime-local expects local wall-clock fields, not UTC clock fields. */
export const datetimeLocal = (date = new Date()): string => {
  if (!Number.isFinite(date.getTime())) throw new RangeError("Invalid local date.");
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${String(date.getFullYear()).padStart(4, "0")}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
