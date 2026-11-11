import {
  ConnectorsRayfinClient,
  resolveRayfinConfig,
  type RayfinRuntimeConfig,
} from '@microsoft/rayfin-client';
import { fabricSemanticModel } from '@microsoft/rayfin-connector-fabric-semanticmodel';
import { resolveRayfinFunctionsBaseUrl } from '@microsoft/rayfin-local-dev';

import {
  connectorConfig as maintenanceConfig,
  type MaintenanceSchema,
} from '../../../rayfin/connectors/maintenance/schema';
import {
  connectorConfig as planningConfig,
  type PlanningSchema,
} from '../../../rayfin/connectors/planning/schema';
import {
  connectorConfig as procurementConfig,
  type ProcurementSchema,
} from '../../../rayfin/connectors/procurement/schema';
import type { AppSchema } from '../../../rayfin/data/schema';
import type { AppFunctionsSchema } from '../../../rayfin/functions/src/types';

/** Connector names must match `connectors[].name` in rayfin/rayfin.yml. */
export type AppConnectorsSchema = {
  planning: PlanningSchema;
  maintenance: MaintenanceSchema;
  procurement: ProcurementSchema;
};

export type AppClient = ConnectorsRayfinClient<
  AppSchema,
  AppFunctionsSchema,
  AppConnectorsSchema
>;

/**
 * A singleton service that manages the Rayfin client: app data (ideas),
 * functions (data agents) and the semantic model connectors.
 */
export class RayfinClientService {
  private static instance: RayfinClientService | null = null;
  private _client: AppClient | null = null;

  private constructor() {}

  public static getInstance(): RayfinClientService {
    if (!RayfinClientService.instance) {
      RayfinClientService.instance = new RayfinClientService();
    }
    return RayfinClientService.instance;
  }

  public async initialize(
    baseUrl: string,
    publishableKey: string,
    projectId?: string,
    runtimeConfig?: RayfinRuntimeConfig
  ): Promise<AppClient> {
    if (!this._client) {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Origin: window.location.origin,
      };

      const resolved = await resolveRayfinConfig({
        apiUrl: baseUrl,
        publishableKey,
        ...runtimeConfig,
        // Managed-hosting moniker (set by `rayfin up`) threads through as itemId.
        itemId: runtimeConfig?.itemId ?? projectId,
      });

      this._client = new ConnectorsRayfinClient<
        AppSchema,
        AppFunctionsSchema,
        AppConnectorsSchema
      >(
        {
          baseUrl: resolved.baseUrl!,
          publishableKey: resolved.publishableKey!,
          headers,
          authStorage: true,
          functionsBaseUrl: resolveRayfinFunctionsBaseUrl(),
          runtimeConfig: resolved.runtimeConfig,
          connectors: {
            planning: planningConfig,
            maintenance: maintenanceConfig,
            procurement: procurementConfig,
          },
        },
        {
          planning: fabricSemanticModel(),
          maintenance: fabricSemanticModel(),
          procurement: fabricSemanticModel(),
        }
      );
    }

    return this._client;
  }

  public getClient(): AppClient {
    if (!this._client) {
      throw new Error('RayfinClient not initialized. Call initialize() first.');
    }
    return this._client;
  }

  public isInitialized(): boolean {
    return this._client !== null;
  }

  public static reset(): void {
    RayfinClientService.instance = null;
  }
}

export function getRayfinClient(): AppClient {
  return RayfinClientService.getInstance().getClient();
}
