import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addOzonParcel,
  customerBaseUrl,
  extractProviderStatus,
  fetchOzonCities,
  OzonExpressError,
  ozonDeliveryNotePdfUrls,
  parseOzonParcelInfo,
  verifyOzonCredentials,
} from "./client";

const credentials = {
  customerId: "75450",
  apiKey: "secret-key",
  apiBaseUrl: "https://api.ozonexpress.ma",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ozon express client", () => {
  it("builds the customer-scoped base URL", () => {
    expect(customerBaseUrl(credentials)).toBe(
      "https://api.ozonexpress.ma/customers/75450/secret-key",
    );
  });

  it("parses the public cities catalog", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          CITIES: {
            "37": {
              ID: 37,
              REF: "AGA",
              NAME: "Agadir",
              "DELIVERED-PRICE": 35,
              "RETURNED-PRICE": 0,
              "REFUSED-PRICE": 10,
            },
          },
        }),
      ),
    );
    const cities = await fetchOzonCities();
    expect(cities).toEqual([
      {
        id: 37,
        ref: "AGA",
        name: "Agadir",
        deliveredPrice: 35,
        returnedPrice: 0,
        refusedPrice: 10,
      },
    ]);
  });

  it("creates a parcel and reads TRACKING-NUMBER", async () => {
    let calledUrl = "";
    let calledInit: RequestInit | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calledUrl = String(input);
        calledInit = init;
        return Response.json({
          "TRACKING-NUMBER": "OZE123456789",
          RECEIVER: "Mohammed Alami",
          CITY_ID: "37",
        });
      }),
    );

    const result = await addOzonParcel(credentials, {
      receiver: "Mohammed Alami",
      phone: "0612345678",
      cityId: 37,
      address: "Rue Hassan II",
      price: 250,
      stock: 0,
    });

    expect(result.trackingNumber).toBe("OZE123456789");
    expect(calledUrl).toContain("/customers/75450/secret-key/add-parcel");
    expect(calledInit?.method).toBe("POST");
    expect(calledInit?.body).toBeInstanceOf(FormData);
  });

  it("parses the live ADD-PARCEL / NEW-PARCEL response shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          "ADD-PARCEL": {
            CUSTOMER: { RESULT: "SUCCESS", MESSAGE: "Valid Customer" },
            RESULT: "SUCCESS",
            MESSAGE: "New Parcel Added",
            "NEW-PARCEL": {
              "TRACKING-NUMBER": "TJ-2026-0000001",
              RECEIVER: "Mohammed Alami",
              PHONE: "0612345678",
              CITY_ID: 61,
              ADDRESS: "Mistah raha",
              PRICE: 249,
            },
          },
        }),
      ),
    );

    const result = await addOzonParcel(credentials, {
      trackingNumber: "TJ-2026-0000001",
      receiver: "Mohammed Alami",
      phone: "0612345678",
      cityId: 61,
      address: "Mistah raha",
      price: 249,
      stock: 0,
    });

    expect(result.trackingNumber).toBe("TJ-2026-0000001");
    expect(result.cityId).toBe("61");
  });

  it("recovers when tracking number was already created on Ozon", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          "ADD-PARCEL": {
            CUSTOMER: { RESULT: "SUCCESS", MESSAGE: "Valid Customer" },
            RESULT: "ERROR",
            MESSAGE: "Tracking Number Used Before",
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          CHECK_API: { RESULT: "SUCCESS", MESSAGE: "Valide API Key" },
          "PARCEL-INFO": {
            CUSTOMER: { RESULT: "SUCCESS", MESSAGE: "Valid Customer" },
            RESULT: "SUCCESS",
            MESSAGE: "Parcel Found",
            INFOS: {
              "TRACKING-NUMBER": "TJ-2026-0000001",
              RECEIVER: "Mohammed Alami",
              CITY_ID: "61",
              CITY_NAME: "Safi",
            },
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await addOzonParcel(credentials, {
      trackingNumber: "TJ-2026-0000001",
      receiver: "Mohammed Alami",
      phone: "0612345678",
      cityId: 61,
      address: "Mistah raha",
      price: 249,
      stock: 0,
    });

    expect(result.trackingNumber).toBe("TJ-2026-0000001");
    expect(result.cityName).toBe("Safi");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("parses parcel-info payloads", () => {
    const parsed = parseOzonParcelInfo({
      "PARCEL-INFO": {
        RESULT: "SUCCESS",
        INFOS: { "TRACKING-NUMBER": "TJ-2026-0000002", CITY_NAME: "Taghazout" },
      },
    });
    expect(parsed?.trackingNumber).toBe("TJ-2026-0000002");
    expect(parsed?.cityName).toBe("Taghazout");
  });

  it("rejects invalid API keys", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          CHECK_API: { RESULT: "ERROR", MESSAGE: "Please verify your API Key" },
        }),
      ),
    );
    await expect(
      addOzonParcel(credentials, {
        receiver: "Test",
        phone: "0612345678",
        cityId: 1,
        address: "Addr",
        price: 10,
        stock: 0,
      }),
    ).rejects.toBeInstanceOf(OzonExpressError);
  });

  it("treats parcel-not-found as valid credentials", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ MESSAGE: "Parcel not found", RESULT: "ERROR" }),
      ),
    );
    await expect(verifyOzonCredentials(credentials)).resolves.toEqual({
      ok: true,
    });
  });

  it("extracts provider status from tracking payloads", () => {
    expect(
      extractProviderStatus({
        TRACKING: { orderStatus: "IN_PROGRESS" },
      }),
    ).toBe("IN_PROGRESS");
    expect(extractProviderStatus({ STATUS: "DELIVERED" })).toBe("DELIVERED");
  });

  it("builds delivery note PDF URLs", () => {
    const urls = ozonDeliveryNotePdfUrls("BL240115001");
    expect(urls.standard).toContain("dn-ref=BL240115001");
    expect(urls.tickets10x10).toContain("pdf-delivery-note-tickets-4-4");
  });
});
