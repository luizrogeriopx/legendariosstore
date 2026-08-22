export function formatBRL(value: number | null | undefined): string {
  if (value == null) return "";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function formatSold(count: number | null | undefined): string {
  if (!count) return "";
  if (count >= 1000) return `${(count / 1000).toFixed(count % 1000 ? 1 : 0)}mil vendidos`;
  return `${count} vendidos`;
}
