import type {
  OzonAddParcelInput,
  OzonAddParcelResult,
  OzonApiErrorPayload,
  OzonCity,
  OzonCredentials,
} from "./types";

const DEFAULT_API_ORIGIN = "https://api.ozonexpress.ma";
const DEFAULT_PDF_ORIGIN = "https://client.ozonexpress.ma";

export class OzonExpressError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status = 400, payload?: unknown) {
    super(message);
    this.name = "OzonExpressError";
    this.status = status;
    this.payload = payload;
  }
}

function apiOrigin(baseUrl?: string | null) {
  const raw = (baseUrl || DEFAULT_API_ORIGIN).trim().replace(/\/$/, "");
  if (raw.includes("/customers/")) {
    return raw.replace(/\/customers\/.*$/, "") || DEFAULT_API_ORIGIN;
  }
  return raw || DEFAULT_API_ORIGIN;
}

export function customerBaseUrl(credentials: OzonCredentials) {
  const origin = apiOrigin(credentials.apiBaseUrl);
  return `${origin}/customers/${encodeURIComponent(credentials.customerId)}/${encodeURIComponent(credentials.apiKey)}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function firstRecord(
  root: Record<string, unknown>,
  ...keys: string[]
): Record<string, unknown> | null {
  for (const key of keys) {
    const value = asRecord(root[key]);
    if (value) return value;
  }
  return null;
}

function assertApiOk(payload: unknown, status: number) {
  const root = asRecord(payload);
  const check = asRecord(root?.CHECK_API) as OzonApiErrorPayload | null;
  if (check?.RESULT === "ERROR") {
    throw new OzonExpressError(
      check.MESSAGE || check.message || "Ozon Express API rejected the request",
      status,
      payload,
    );
  }
  const scopes = [
    root,
    firstRecord(root ?? {}, "ADD-PARCEL", "ADD_PARCEL"),
  ].filter(Boolean) as Record<string, unknown>[];
  for (const scope of scopes) {
    const result = readString(scope, "RESULT", "result");
    if (result?.toUpperCase() === "ERROR") {
      throw new OzonExpressError(
        readString(scope, "MESSAGE", "message") ||
          "Ozon Express API rejected the request",
        status,
        payload,
      );
    }
  }
}

async function parseJsonResponse(response: Response) {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new OzonExpressError(
      `Invalid JSON from Ozon Express (${response.status})`,
      response.status,
      text.slice(0, 500),
    );
  }
}

async function postForm(
  credentials: OzonCredentials,
  path: string,
  fields: Record<string, string | undefined>,
) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value != null && value !== "") body.append(key, value);
  }
  const response = await fetch(`${customerBaseUrl(credentials)}/${path}`, {
    method: "POST",
    body,
  });
  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    throw new OzonExpressError(
      `Ozon Express HTTP ${response.status}`,
      response.status,
      payload,
    );
  }
  assertApiOk(payload, response.status);
  return payload;
}

export async function fetchOzonCities(
  origin = DEFAULT_API_ORIGIN,
): Promise<OzonCity[]> {
  const response = await fetch(`${apiOrigin(origin)}/cities`, {
    method: "GET",
    cache: "no-store",
  });
  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    throw new OzonExpressError(
      `Unable to load Ozon cities (${response.status})`,
      response.status,
      payload,
    );
  }
  const root = asRecord(payload);
  const cities = asRecord(root?.CITIES) ?? asRecord(root?.cities) ?? root;
  if (!cities) return [];
  return Object.values(cities)
    .map((entry) => {
      const city = asRecord(entry);
      if (!city) return null;
      const id = Number(city.ID ?? city.id);
      const name = readString(city, "NAME", "name");
      if (!Number.isFinite(id) || !name) return null;
      return {
        id,
        ref: readString(city, "REF", "ref") || String(id),
        name,
        deliveredPrice: Number(city["DELIVERED-PRICE"] ?? city.deliveredPrice ?? 0),
        returnedPrice: Number(city["RETURNED-PRICE"] ?? city.returnedPrice ?? 0),
        refusedPrice: Number(city["REFUSED-PRICE"] ?? city.refusedPrice ?? 0),
      } satisfies OzonCity;
    })
    .filter((city): city is OzonCity => city != null)
    .sort((left, right) => left.name.localeCompare(right.name, "fr"));
}

export async function verifyOzonCredentials(credentials: OzonCredentials) {
  // parcel-info with a fake tracking number still validates the API key.
  try {
    await postForm(credentials, "parcel-info", {
      "tracking-number": "OZE-CREDENTIAL-CHECK",
    });
    return { ok: true as const };
  } catch (error) {
    if (error instanceof OzonExpressError) {
      const message = error.message.toLowerCase();
      if (
        message.includes("api key") ||
        message.includes("verify your") ||
        message.includes("customer")
      ) {
        return { ok: false as const, message: error.message };
      }
      // Key accepted; parcel simply not found.
      return { ok: true as const };
    }
    throw error;
  }
}

function trackingFromRecord(record: Record<string, unknown> | null | undefined) {
  if (!record) return undefined;
  return readString(
    record,
    "TRACKING-NUMBER",
    "TRACKING_NUMBER",
    "tracking-number",
    "tracking_number",
    "CODE",
    "code",
  );
}

function parcelResultFromRecords(
  nested: Record<string, unknown>,
  payload: unknown,
): OzonAddParcelResult {
  const trackingNumber = trackingFromRecord(nested);
  if (!trackingNumber) {
    throw new OzonExpressError(
      "Ozon Express did not return a tracking number",
      502,
      payload,
    );
  }
  return {
    trackingNumber,
    receiver: readString(nested, "RECEIVER", "RECEIVER_NAME", "receiver"),
    phone: readString(nested, "PHONE", "phone"),
    cityId: readString(nested, "CITY_ID", "city_id"),
    cityName: readString(nested, "CITY_NAME", "city_name"),
    address: readString(nested, "ADDRESS", "address"),
    price: readString(nested, "PRICE", "price"),
    raw: payload,
  };
}

export function isTrackingNumberUsedBeforeError(error: unknown) {
  if (!(error instanceof OzonExpressError)) return false;
  return /tracking number used before/i.test(error.message);
}

export function parseOzonParcelInfo(
  payload: unknown,
): OzonAddParcelResult | null {
  const root = asRecord(payload) ?? {};
  const infoRoot =
    firstRecord(root, "PARCEL-INFO", "PARCEL_INFO", "PARCEL") ?? root;
  const nested =
    firstRecord(infoRoot, "INFOS", "INFO", "NEW-PARCEL", "NEW_PARCEL") ??
    infoRoot;
  const trackingNumber =
    trackingFromRecord(nested) ||
    trackingFromRecord(infoRoot) ||
    trackingFromRecord(root);
  if (!trackingNumber) return null;
  return parcelResultFromRecords(
    {
      ...nested,
      "TRACKING-NUMBER": trackingNumber,
    },
    payload,
  );
}

export async function addOzonParcel(
  credentials: OzonCredentials,
  input: OzonAddParcelInput,
): Promise<OzonAddParcelResult> {
  const fields: Record<string, string | undefined> = {
    "tracking-number": input.trackingNumber,
    "parcel-receiver": input.receiver,
    "parcel-phone": input.phone,
    "parcel-city": String(input.cityId),
    "parcel-address": input.address,
    "parcel-note": input.note,
    "parcel-price": String(Math.trunc(input.price)),
    "parcel-nature": input.nature,
    "parcel-stock": String(input.stock),
    "parcel-open": String(input.open ?? 1),
    "parcel-fragile": String(input.fragile ?? 0),
    "parcel-replace": String(input.replace ?? 0),
    "parcel-declared-value":
      input.declaredValue != null ? String(Math.trunc(input.declaredValue)) : undefined,
    products:
      input.stock === 1 && input.products?.length
        ? JSON.stringify(input.products)
        : undefined,
  };
  try {
    const payload = await postForm(credentials, "add-parcel", fields);
    const root = asRecord(payload) ?? {};
    // Live API shape:
    // { "ADD-PARCEL": { RESULT, MESSAGE, "NEW-PARCEL": { "TRACKING-NUMBER": ... } } }
    const addParcel =
      firstRecord(root, "ADD-PARCEL", "ADD_PARCEL", "PARCEL", "DATA") ?? root;
    const nested =
      firstRecord(addParcel, "NEW-PARCEL", "NEW_PARCEL", "PARCEL", "DATA") ??
      addParcel;
    const tracking =
      trackingFromRecord(nested) ||
      trackingFromRecord(addParcel) ||
      trackingFromRecord(root);
    return parcelResultFromRecords(
      {
        ...nested,
        ...(tracking ? { "TRACKING-NUMBER": tracking } : {}),
      },
      payload,
    );
  } catch (error) {
    // First attempt may have created the parcel while our app failed to parse
    // the response. Retrying with the same order code then returns this error.
    if (
      isTrackingNumberUsedBeforeError(error) &&
      input.trackingNumber?.trim()
    ) {
      const existing = await getOzonParcelInfo(
        credentials,
        input.trackingNumber.trim(),
      );
      const parsed = parseOzonParcelInfo(existing);
      if (parsed) return parsed;
      return {
        trackingNumber: input.trackingNumber.trim(),
        raw: existing,
      };
    }
    throw error;
  }
}

export async function getOzonParcelInfo(
  credentials: OzonCredentials,
  trackingNumber: string,
) {
  return postForm(credentials, "parcel-info", {
    "tracking-number": trackingNumber,
  });
}

export async function getOzonTracking(
  credentials: OzonCredentials,
  trackingNumber: string,
) {
  return postForm(credentials, "tracking", {
    "tracking-number": trackingNumber,
  });
}

export async function getOzonTrackingBulk(
  credentials: OzonCredentials,
  trackingNumbers: string[],
) {
  const response = await fetch(`${customerBaseUrl(credentials)}/tracking`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: { "tracking-number": trackingNumbers },
    }),
  });
  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    throw new OzonExpressError(
      `Ozon Express HTTP ${response.status}`,
      response.status,
      payload,
    );
  }
  assertApiOk(payload, response.status);
  return payload;
}

export async function createOzonDeliveryNote(credentials: OzonCredentials) {
  const payload = await postForm(credentials, "add-delivery-note", {});
  const root = asRecord(payload) ?? {};
  const nested =
    asRecord(root.ADD_DELIVERY_NOTE) ??
    asRecord(root.DELIVERY_NOTE) ??
    asRecord(root.DATA) ??
    root;
  const ref = readString(nested, "ref", "REF", "id_delivery_note", "ID");
  if (!ref) {
    throw new OzonExpressError(
      "Ozon Express did not return a delivery note reference",
      502,
      payload,
    );
  }
  return { ref, raw: payload };
}

export async function addParcelsToOzonDeliveryNote(
  credentials: OzonCredentials,
  ref: string,
  trackingCodes: string[],
) {
  const body = new FormData();
  body.append("Ref", ref);
  trackingCodes.forEach((code, index) => {
    body.append(`Codes[${index}]`, code);
  });
  const response = await fetch(
    `${customerBaseUrl(credentials)}/add-parcel-to-delivery-note`,
    { method: "POST", body },
  );
  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    throw new OzonExpressError(
      `Ozon Express HTTP ${response.status}`,
      response.status,
      payload,
    );
  }
  assertApiOk(payload, response.status);
  return payload;
}

export async function saveOzonDeliveryNote(
  credentials: OzonCredentials,
  ref: string,
) {
  return postForm(credentials, "save-delivery-note", { Ref: ref });
}

export function ozonDeliveryNotePdfUrls(ref: string) {
  const encoded = encodeURIComponent(ref);
  return {
    standard: `${DEFAULT_PDF_ORIGIN}/pdf-delivery-note?dn-ref=${encoded}`,
    ticketsA4: `${DEFAULT_PDF_ORIGIN}/pdf-delivery-note-tickets?dn-ref=${encoded}`,
    tickets10x10: `${DEFAULT_PDF_ORIGIN}/pdf-delivery-note-tickets-4-4?dn-ref=${encoded}`,
  };
}

export function extractProviderStatus(payload: unknown): string | undefined {
  const root = asRecord(payload);
  if (!root) return undefined;
  const nested =
    asRecord(root.TRACKING) ??
    asRecord(root.PARCEL) ??
    asRecord(root.INFO) ??
    asRecord(root.DATA) ??
    root;
  return (
    readString(
      nested,
      "orderStatus",
      "ORDER_STATUS",
      "STATUS",
      "status",
      "STATUT",
      "CODE",
      "code",
    ) ?? undefined
  );
}
