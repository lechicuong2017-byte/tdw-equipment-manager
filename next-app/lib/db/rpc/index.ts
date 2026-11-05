import "server-only";
// Bảng tra RPC: thay các hàm PostgreSQL gọi qua supabase.rpc(name, args).

import { DbError } from "@/lib/db/sql";
import type { Session } from "@/lib/db/builder";
import type { RpcHandler } from "@/lib/db/rpc/helpers";
import { assetRpcs } from "@/lib/db/rpc/assets";
import { vehicleRpcs } from "@/lib/db/rpc/vehicles";
import { adminRpcs } from "@/lib/db/rpc/admin";
import { telecomSurveyRpcs } from "@/lib/db/rpc/telecom-surveys";
import { itCostRpcs, supplyRpcs } from "@/lib/db/rpc/it-costs";

const REGISTRY: Record<string, RpcHandler> = {
  ...assetRpcs,
  ...vehicleRpcs,
  ...adminRpcs,
  ...telecomSurveyRpcs,
  ...itCostRpcs,
  ...supplyRpcs,
};

export function hasRpc(name: string) {
  return name in REGISTRY;
}

export async function callRpc(name: string, args: Record<string, unknown>, ctx: { session: Session; client: unknown }) {
  const handler = REGISTRY[name];
  if (!handler) throw new DbError(`Could not find the function public.${name}`, "PGRST202");
  return handler(args ?? {}, { session: ctx.session });
}
