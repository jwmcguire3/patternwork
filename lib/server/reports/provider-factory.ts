import { OpenRouterClient, type OpenRouterClientOptions } from "../openrouter/client.ts";
import { validatePositiveMicros } from "../openrouter/qualification-budget.ts";
import type { EncryptionKeyring } from "../security/index.ts";
import { JournaledPwrp71Transport } from "./qualification/attempt-store.ts";
import { PrismaProviderAttemptStore, type ProviderLedgerDatabase } from "./prisma-provider-attempt-store.ts";
import type { BudgetedPwrp71Provider, Pwrp71ProviderContext } from "./types.ts";

export function productionProviderBudget(env: Readonly<Record<string, string | undefined>> = process.env): { aggregateCostCapMicros: number; maxCallCostMicros: number } {
  const parse = (name: string, fallback?: number) => {
    const value = env[name] === undefined ? fallback : Math.floor(Number(env[name]) * 1_000_000);
    try { validatePositiveMicros(value, name); }
    catch { throw new Error(`${name} must be configured as a positive safe microdollar amount.`); }
    return value;
  };
  return { aggregateCostCapMicros: parse("OPENROUTER_MAX_COST_PER_ASSESSMENT_USD"), maxCallCostMicros: parse("OPENROUTER_MAX_COST_PER_CALL_USD", 500_000) };
}

/** The production v7.1 factory always uses the real guarded client and a durable session journal. */
export function createProductionPwrp71Provider(context: Pwrp71ProviderContext, options: {
  aggregateCostCapMicros: number;
  maxCallCostMicros?: number;
  database?: ProviderLedgerDatabase;
  keyring?: EncryptionKeyring;
  clientOptions?: OpenRouterClientOptions;
}): BudgetedPwrp71Provider {
  if (context.prepared.contractVersion !== "v7.1") throw new Error("Production PWRP 7.1 provider requires its activated report inputs.");
  validatePositiveMicros(options.aggregateCostCapMicros, "aggregateCostCapMicros");
  const maxCallCostMicros = options.maxCallCostMicros ?? 500_000;
  validatePositiveMicros(maxCallCostMicros, "maxCallCostMicros");
  const store = new PrismaProviderAttemptStore({ ...context, database: options.database, keyring: options.keyring });
  const clientOptions = { ...options.clientOptions, captureProviderErrorDetail: false,
    appUrl: options.clientOptions?.appUrl ?? process.env.OPENROUTER_APP_URL,
    appTitle: options.clientOptions?.appTitle ?? process.env.OPENROUTER_APP_NAME };
  const client = new OpenRouterClient(clientOptions);
  const provider = new JournaledPwrp71Transport({ store, transport: client, endpoint: client.endpoint,
    aggregateCostCapMicros: options.aggregateCostCapMicros, maxCallCostMicros, privacyIdentityContext: context.privacyIdentityContext,
    outboundMetadataStrings: [clientOptions.appUrl, clientOptions.appTitle].filter((value): value is string => value !== undefined) });
  return { provider, onPwrp71Event: async event => {
    const attemptId = event.type === "repair_decision" ? event.triggerAttemptId : event.attemptId;
    if (event.reportType !== context.reportType || !attemptId.startsWith(`${context.input.invocationKey}:${context.reportType}:`)) throw new Error("Provider event is outside its workflow/report binding.");
    return store.recordGenerationEvent(event);
  } };
}
