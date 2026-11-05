export type OzonCity = {
  id: number;
  ref: string;
  name: string;
  deliveredPrice: number;
  returnedPrice: number;
  refusedPrice: number;
};

export type OzonAddParcelInput = {
  trackingNumber?: string;
  receiver: string;
  phone: string;
  cityId: number;
  address: string;
  note?: string;
  price: number;
  nature?: string;
  /** 0 = ramassage, 1 = stock Ozon */
  stock: 0 | 1;
  /** 1 = ouvrir, 2 = ne pas ouvrir */
  open?: 1 | 2;
  fragile?: 0 | 1;
  replace?: 0 | 1;
  products?: Array<{ ref: string; qnty: number }>;
  declaredValue?: number;
};

export type OzonAddParcelResult = {
  trackingNumber: string;
  receiver?: string;
  phone?: string;
  cityId?: string;
  cityName?: string;
  address?: string;
  price?: string;
  raw: unknown;
};

export type OzonCredentials = {
  customerId: string;
  apiKey: string;
  apiBaseUrl?: string | null;
};

export type OzonApiErrorPayload = {
  RESULT?: string;
  MESSAGE?: string;
  message?: string;
};
