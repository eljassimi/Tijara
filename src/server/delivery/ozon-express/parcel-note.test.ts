import { describe, expect, it } from "vitest";

import { buildOzonParcelNote } from "./parcel-note";

describe("buildOzonParcelNote", () => {
  it("formats product color size and quantity for the label comment", () => {
    const note = buildOzonParcelNote({
      notes: null,
      lines: [
        {
          productNameFr: "Chemise Royal",
          quantity: 1,
          variant: { color: "Bleu", size: "3XL" },
        },
      ],
    });
    expect(note).toBe("Chemise Royal · Bleu / 3XL ×1");
  });

  it("joins several lines and keeps partner notes", () => {
    const note = buildOzonParcelNote(
      {
        notes: "Sonner 2 fois",
        lines: [
          {
            productNameFr: "Chemise Royal",
            quantity: 1,
            variant: { color: "Bleu", size: "M" },
          },
          {
            productNameFr: "Survêt Sélène",
            quantity: 2,
            variant: { color: "Beige", size: "S" },
          },
        ],
      },
      "Envoi automatique après confirmation",
    );
    expect(note).toBe(
      "Chemise Royal · Bleu / M ×1 | Survêt Sélène · Beige / S ×2 — Sonner 2 fois",
    );
  });
});
