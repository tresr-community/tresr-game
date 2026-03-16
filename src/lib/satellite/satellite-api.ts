/**
 * satellite-api.ts
 *
 * Stable wrappers around the satellite IC actor functions.
 *
 * WHY THIS EXISTS: `juno functions build` regenerates
 * `src/declarations/satellite/satellite.api.ts` and may not preserve the
 * `export const functions` bundle that callers historically depended on.
 * This module copies the same `getSatelliteExtendedActor` pattern used
 * internally by the generated file, making it immune to codegen format changes.
 *
 * Import individual functions from here, NOT from satellite.api.ts directly.
 */
import type {
  _SERVICE as SatelliteActor,
  ErrorPayload,
  Result,
  Result_1,
  Result_2,
  Result_3,
} from "@/declarations/satellite/satellite.did";
import {idlFactory} from "@/declarations/satellite/satellite.factory.did.js";
import {getSatelliteExtendedActor} from "@junobuild/core";

const actor = () => getSatelliteExtendedActor<SatelliteActor>({idlFactory});

export const claimAuthorize = async (
  sessionId: string,
  reportedKeys: bigint,
  feeTxHash: string,
  replayInputs: Uint8Array
): Promise<Result> => {
  const {claim_authorize} = await actor();
  return await claim_authorize(
    sessionId,
    reportedKeys,
    feeTxHash,
    replayInputs
  );
};

export const deleteErrors = async (ids: Array<string>): Promise<Result_1> => {
  const {delete_errors} = await actor();
  return await delete_errors(ids);
};

export const getConfigHash = async (): Promise<string> => {
  const {get_config_hash} = await actor();
  return await get_config_hash();
};

export const getErrors = async (): Promise<Result_2> => {
  const {get_errors} = await actor();
  return await get_errors();
};

export const getOracleAddress = async (): Promise<Result_3> => {
  const {get_oracle_address} = await actor();
  return await get_oracle_address();
};

export const reportError = async (payload: ErrorPayload): Promise<Result_3> => {
  const {report_error} = await actor();
  return await report_error(payload);
};

export const resolveError = async (
  id: string,
  resolved: boolean
): Promise<Result_1> => {
  const {resolve_error} = await actor();
  return await resolve_error(id, resolved);
};

export const liftBan = async (principal: string): Promise<Result_1> => {
  const {lift_ban} = await actor();
  return await lift_ban(principal);
};
