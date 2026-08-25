export type SupplyItemCategory = "OFFICE_SUPPLY" | "CLEANING_SUPPLY";

const categoryPrefix: Record<SupplyItemCategory, string> = {
  OFFICE_SUPPLY: "VPP",
  CLEANING_SUPPLY: "DVS",
};

export function buildSupplyItemCode(category: SupplyItemCategory, year: number, sequence: number) {
  return `TDW-${categoryPrefix[category]}-${year}-${String(sequence).padStart(3, "0")}`;
}

export function supplyItemCodeSequence(code: string | null | undefined, category: SupplyItemCategory, year: number) {
  const prefix = `TDW-${categoryPrefix[category]}-${year}-`;
  if (!code?.toUpperCase().startsWith(prefix)) return 0;
  const sequence = Number(code.slice(prefix.length));
  return Number.isInteger(sequence) && sequence > 0 ? sequence : 0;
}

export function normalizedSupplyName(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

