import { BaseCryptoAdapter } from "../shared/base";
import { BinanceRestClient } from "../shared/rest-client";
import type { AdapterAccountContext, CryptoExchangeClient } from "../shared/types";
export class BinanceAdapter extends BaseCryptoAdapter { constructor(account: AdapterAccountContext, client?: CryptoExchangeClient) { super("binance", account, client ?? new BinanceRestClient({ environment: account.environment, productType: account.productType ?? "usdt_futures", baseUrl: account.baseUrl, credentials: account.apiKey && account.apiSecret ? { apiKey: account.apiKey, apiSecret: account.apiSecret } : undefined })); } }
export const BINANCE_ENVIRONMENTS = ["demo", "testnet", "live"] as const;
export { BinanceRestClient } from "../shared/rest-client";
