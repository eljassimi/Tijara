import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import {
  normalizeImportHeader,
  parseGoogleSheetUrl,
  parseOrderWorkbook,
} from "./import-format";

describe("order import format", () => {
  it("accepts friendly French column names", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Commandes");
    sheet.addRow([
      "Référence commande",
      "Nom du client",
      "Téléphone",
      "Ville",
      "SKU",
      "Quantité",
      "Adresse",
    ]);
    sheet.addRow([
      "WEB-42",
      "Sara Amrani",
      612345678,
      "Casablanca",
      "SKU-RED",
      2,
      "Maarif",
    ]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    await expect(parseOrderWorkbook(buffer)).resolves.toEqual([
      expect.objectContaining({
        orderId: "WEB-42",
        customerName: "Sara Amrani",
        phone: "612345678",
        city: "Casablanca",
        variantSku: "SKU-RED",
        quantity: "2",
      }),
    ]);
  });

  it("normalizes accented and spaced headers", () => {
    expect(normalizeImportHeader("  Téléphone client ")).toBe(
      "telephoneclient",
    );
  });

  it("only accepts Google Sheets document links and keeps the selected tab", () => {
    expect(
      parseGoogleSheetUrl(
        "https://docs.google.com/spreadsheets/d/abc_DEF-123/edit#gid=987",
      ),
    ).toMatchObject({
      spreadsheetId: "abc_DEF-123",
      gid: "987",
      exportUrl:
        "https://docs.google.com/spreadsheets/d/abc_DEF-123/export?format=csv&gid=987",
    });
    expect(
      parseGoogleSheetUrl(
        "https://docs.google.com/spreadsheets/d/abc_DEF-123/edit?usp=sharing",
      ),
    ).toMatchObject({
      spreadsheetId: "abc_DEF-123",
      gid: undefined,
      format: "xlsx",
      exportUrl:
        "https://docs.google.com/spreadsheets/d/abc_DEF-123/export?format=xlsx",
    });
    expect(() =>
      parseGoogleSheetUrl("https://example.com/spreadsheets/d/abc/edit"),
    ).toThrow();
  });

  it("detects an order tab with metadata rows and ignores styled empty rows", async () => {
    const workbook = new ExcelJS.Workbook();
    const backup = workbook.addWorksheet("Backup");
    backup.addRow([
      "Order ID",
      "First name",
      "Product name",
      "Phone",
      "City",
      "Product variant",
    ]);
    backup.addRow([
      "001",
      "Backup client",
      "Old product",
      "0611111111",
      "Rabat",
      "M",
    ]);
    const orders = workbook.addWorksheet("Youcan-Orders");
    orders.addRow(["Store orders"]);
    orders.addRow(["Current orders"]);
    orders.addRow([
      "Order ID",
      "First name",
      "Product name",
      "Phone",
      "City",
      "Address / العنوان",
      "Product variant",
      "Variant price",
      "Quantity",
      "Comment",
    ]);
    orders.addRow([
      "006",
      "Majdouline",
      "Real Madrid Jersey",
      "0661898040",
      "Rabat",
      "Aviation",
      "XL",
      229,
      "",
      "Pending",
    ]);
    orders.addRow([
      "007",
      "Badr",
      "Barcelona Kit",
      "0697762805",
      "Zagora",
      "Centre",
      "M",
      249,
      2,
      "Call",
    ]);
    orders.getRow(1000).height = 20;
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    await expect(parseOrderWorkbook(buffer)).resolves.toEqual([
      expect.objectContaining({
        orderId: "006",
        customerName: "Majdouline",
        productName: "Real Madrid Jersey",
        productVariant: "XL",
        quantity: "1",
        address: "Aviation",
      }),
      expect.objectContaining({
        orderId: "007",
        customerName: "Badr",
        productName: "Barcelona Kit",
        quantity: "2",
      }),
    ]);
  });
});
