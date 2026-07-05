import { BaseCryptoAdapter } from "../shared/base";
import { BybitRestClient } from "../shared/rest-client";
import type { AdapterAccountContext, CryptoExchangeClient } from "../shared/types";
export class BybitAdapter extends BaseCryptoAdapter { constructor(account: AdapterAccountContext, client?: CryptoExchangeClient) { super("bybit", account, client ?? new BybitRestClient({ environment: account.environment, productType: account.productType ?? "linear", baseUrl: account.baseUrl, credentials: account.apiKey && account.apiSecret ? { apiKey: account.apiKey, apiSecret: account.apiSecret } : undefined })); } }
export const BYBIT_ENVIRONMENTS = ["demo", "testnet", "live"] as const;
export { BybitRestClient } from "../shared/rest-client";
