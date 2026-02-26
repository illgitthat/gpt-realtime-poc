export type TokenCache = {
  token: string;
  expiresAt: number;
};

export type SessionOptions = {
  voice?: string;
  instructions?: string;
};

export type Credentials = {
  apiKey?: string;
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
};

export type ExchangeInput = {
  fetchImpl: typeof fetch;
  baseUrl: string;
  credentials: Credentials;
  sessionOptions?: SessionOptions;
  sdpOffer: string;
  cachedToken: TokenCache | null;
};

export type ExchangeOutput = {
  sdpAnswer: string;
  cachedToken: TokenCache | null;
};

export function exchangeSdpOffer(input: ExchangeInput): Promise<ExchangeOutput>;
export function toErrorMessage(error: unknown): string;

declare const realtimeCore: {
  exchangeSdpOffer: typeof exchangeSdpOffer;
  toErrorMessage: typeof toErrorMessage;
};

export default realtimeCore;
