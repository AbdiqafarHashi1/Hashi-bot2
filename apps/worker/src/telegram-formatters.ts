export type TelegramCategory = 'signal_entry'|'signal_update'|'signal_resolved'|'runtime_alert'|'operator_alert'|'daily_summary'|'weekly_summary';

const esc = (v: string) => v.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');

export function formatSignalEntry(input:{signalId:string;symbol:string;marketType:string;direction:string;entry:string;stopLoss:string;tp1:string;tp2:string;tp3?:string;timeframe?:string;strategyFamily?:string;tier?:string;rr?:string;expiry?:string;timestamp:string}){
  return `📍 *ENTRY* #${esc(input.signalId.slice(0,8))}\n${esc(input.symbol)} • ${esc(input.marketType)} • ${esc(input.direction.toUpperCase())}\nEntry: ${esc(input.entry)}\nSL: ${esc(input.stopLoss)}\nTP1: ${esc(input.tp1)} | TP2: ${esc(input.tp2)}${input.tp3 ? ` | TP3: ${esc(input.tp3)}`:''}\nTF: ${esc(input.timeframe ?? '-')} • Strategy: ${esc(input.strategyFamily ?? '-')}\nTier: ${esc(input.tier ?? '-')} • RR: ${esc(input.rr ?? '-')}\nExpiry: ${esc(input.expiry ?? '-')}\nAt: ${esc(input.timestamp)}`;
}

export function formatLifecycleUpdate(input:{eventType:string;signalId:string;symbol:string;direction:string;entry:number;price:number;level?:number;r?:number;elapsedMin:number;strategyId?:string;status?:string}){
  return `📡 *${esc(input.eventType)}* #${esc(input.signalId.slice(0,8))}\n${esc(input.symbol)} ${esc(input.direction.toUpperCase())}\nEntry: ${input.entry} • Price: ${input.price}${input.level!==undefined?` • Level: ${input.level}`:''}\nR: ${input.r?.toFixed(2) ?? '-'} • Elapsed: ${input.elapsedMin}m\nStrategy: ${esc(input.strategyId ?? '-')} • Status: ${esc(input.status ?? '-')}`;
}

export function formatRuntimeAlert(input:{severity:'info'|'warning'|'critical';title:string;detail:string;at:string}){
  return `⚠️ *${esc(input.severity.toUpperCase())}* ${esc(input.title)}\n${esc(input.detail)}\nAt: ${esc(input.at)}`;
}
