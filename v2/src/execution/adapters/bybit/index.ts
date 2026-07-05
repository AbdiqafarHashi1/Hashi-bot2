import { BaseCryptoAdapter } from "../shared/base";
import { AdapterAccountContext, CryptoExchangeClient } from "../shared/types";
export class BybitAdapter extends BaseCryptoAdapter { constructor(account: AdapterAccountContext, client: CryptoExchangeClient) { super("bybit", account, client); } }
export const BYBIT_ENVIRONMENTS = ["demo", "testnet", "live"] as const;
