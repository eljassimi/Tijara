import { Readable } from "node:stream";

import ExcelJS from "exceljs";

export const ORDER_IMPORT_COLUMNS = [
  "orderId",
  "customerName",
  "phone",
  "city",
  "variantSku",
  "productName",
  "productVariant",
  "quantity",
  "salePrice",
  "address",
  "notes",
] as const;

type ImportColumn = (typeof ORDER_IMPORT_COLUMNS)[number];

export type OrderImportRow = Record<ImportColumn, string> & {
  rowNumber: number;
};

const headerAliases: Record<ImportColumn, string[]> = {
  orderId: [
    "orderid",
    "externalid",
    "reference",
    "referencecommande",
    "رقمالطلب",
    "مرجعالطلب",
  ],
  customerName: [
    "customername",
    "customer",
    "client",
    "nomclient",
    "nomduclient",
    "firstname",
    "fullname",
    "اسم الزبون",
    "اسمالزبون",
    "الزبون",
  ],
  phone: ["phone", "telephone", "tel", "mobile", "الهاتف", "رقمالهاتف"],
  city: ["city", "cityslug", "ville", "مدينة", "المدينة"],
  variantSku: [
    "variantsku",
    "sku",
    "productsku",
    "skuproduit",
    "referenceproduit",
    "رمزالمنتج",
  ],
  productName: [
    "productname",
    "product",
    "produit",
    "nomproduit",
    "nomduproduit",
    "المنتج",
    "اسمالمنتج",
  ],
  productVariant: [
    "productvariant",
    "variant",
    "variante",
    "taille",
    "size",
    "النوع",
    "المقاس",
  ],
  quantity: ["quantity", "qty", "quantite", "qte", "الكمية"],
  salePrice: [
    "saleprice",
    "variantprice",
    "price",
    "prix",
    "totalcharge",
    "السعر",
  ],
  address: [
    "address",
    "adresse",
    "addressالعنوان",
    "adresseالعنوان",
    "العنوان",
  ],
  notes: ["notes", "note", "remarques", "comment", "commentaire", "ملاحظات"],
};

const requiredColumns: ImportColumn[] = ["customerName", "phone", "city"];

export function normalizeImportHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

function canonicalHeader(value: string): ImportColumn | null {
  const normalized = normalizeImportHeader(value);
  return (
    (Object.entries(headerAliases) as [ImportColumn, string[]][]).find(
      ([, aliases]) =>
        aliases.some((alias) => normalizeImportHeader(alias) === normalized),
    )?.[0] ?? null
  );
}

function cellText(cell: ExcelJS.Cell) {
  const value = cell.value;
  if (value === null || value === undefined) return "";
  if (typeof value === "number")
    return Number.isInteger(value) ? String(value) : String(value);
  if (typeof value === "string" || typeof value === "boolean")
    return String(value).trim();
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if ("result" in value && value.result !== undefined && value.result !== null)
    return String(value.result).trim();
  if ("richText" in value)
    return value.richText
      .map((part) => part.text)
      .join("")
      .trim();
  if ("text" in value) return String(value.text).trim();
  return cell.text.trim();
}

function columnsForRow(sheet: ExcelJS.Worksheet, rowNumber: number) {
  const columns = new Map<ImportColumn, number>();
  sheet
    .getRow(rowNumber)
    .eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      const canonical = canonicalHeader(cellText(cell));
      if (canonical && !columns.has(canonical))
        columns.set(canonical, columnNumber);
    });
  return columns;
}

function findHeaderRow(sheet: ExcelJS.Worksheet) {
  for (
    let rowNumber = 1;
    rowNumber <= Math.min(15, sheet.rowCount);
    rowNumber += 1
  ) {
    const columns = columnsForRow(sheet, rowNumber);
    const hasRequired = requiredColumns.every((column) => columns.has(column));
    const hasProductReference =
      columns.has("variantSku") || columns.has("productName");
    if (hasRequired && hasProductReference) return { rowNumber, columns };
  }
  return null;
}

function rowsFromWorksheet(
  sheet: ExcelJS.Worksheet,
  header: NonNullable<ReturnType<typeof findHeaderRow>>,
) {
  const { rowNumber: headerRowNumber, columns } = header;
  const missing = requiredColumns.filter((column) => !columns.has(column));
  if (missing.length)
    throw new Error(`Colonnes manquantes : ${missing.join(", ")}.`);

  const rows: OrderImportRow[] = [];
  for (
    let rowNumber = headerRowNumber + 1;
    rowNumber <= sheet.rowCount;
    rowNumber += 1
  ) {
    const row = sheet.getRow(rowNumber);
    const read = (column: ImportColumn) => {
      const index = columns.get(column);
      return index ? cellText(row.getCell(index)) : "";
    };
    const customerName = read("customerName");
    const phone = read("phone");
    if (!customerName && !phone) continue;
    rows.push({
      rowNumber,
      orderId: read("orderId"),
      customerName,
      phone,
      city: read("city"),
      variantSku: read("variantSku"),
      productName: read("productName"),
      productVariant: read("productVariant"),
      quantity: read("quantity") || "1",
      salePrice: read("salePrice"),
      address: read("address"),
      notes: read("notes"),
    });
    if (rows.length > 500)
      throw new Error("Le fichier dépasse la limite de 500 commandes.");
  }
  if (!rows.length)
    throw new Error("Le fichier ne contient aucune ligne de commande remplie.");
  return rows;
}

export async function parseOrderWorkbook(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);
  const candidates = workbook.worksheets.flatMap((sheet) => {
    const header = findHeaderRow(sheet);
    if (!header) return [];
    try {
      return [{ sheet, rows: rowsFromWorksheet(sheet, header) }];
    } catch {
      return [];
    }
  });
  const preferred = candidates.find(
    (candidate) => candidate.sheet.name.toLowerCase() === "orders",
  );
  const selected =
    preferred ?? candidates.sort((a, b) => b.rows.length - a.rows.length)[0];
  if (!selected)
    throw new Error("Aucun onglet de commandes compatible n’a été trouvé.");
  return selected.rows;
}

export async function parseOrderCsv(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  const sheet = await workbook.csv.read(Readable.from(buffer));
  const header = findHeaderRow(sheet);
  if (!header)
    throw new Error("Aucun en-tête de commandes compatible n’a été trouvé.");
  return rowsFromWorksheet(sheet, header);
}

export function parseGoogleSheetUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Lien Google Sheets invalide.");
  }
  if (url.protocol !== "https:" || url.hostname !== "docs.google.com")
    throw new Error("Utilisez un lien https://docs.google.com/spreadsheets/…");
  const match = url.pathname.match(
    /^\/spreadsheets\/d\/([a-zA-Z0-9_-]+)(?:\/|$)/,
  );
  if (!match) throw new Error("Lien Google Sheets invalide.");
  const hashGid = url.hash.match(/(?:^#|[?&])gid=(\d+)/)?.[1];
  const gid = url.searchParams.get("gid")?.match(/^\d+$/)?.[0] ?? hashGid;
  return {
    spreadsheetId: match[1],
    gid,
    canonicalUrl: `https://docs.google.com/spreadsheets/d/${match[1]}/edit${gid ? `#gid=${gid}` : ""}`,
    exportUrl: gid
      ? `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv&gid=${gid}`
      : `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=xlsx`,
    format: gid ? ("csv" as const) : ("xlsx" as const),
  };
}
