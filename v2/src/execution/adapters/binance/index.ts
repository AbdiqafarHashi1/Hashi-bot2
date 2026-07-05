import { BaseCryptoAdapter } from "../shared/base";
import { AdapterAccountContext, CryptoExchangeClient } from "../shared/types";
export class BinanceAdapter extends BaseCryptoAdapter { constructor(account: AdapterAccountContext, client: CryptoExchangeClient) { super("binance", account, client); } }
export const BINANCE_ENVIRONMENTS = ["demo", "testnet", "live"] as const;
