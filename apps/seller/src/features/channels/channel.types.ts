export type ChannelKind = 'marketplace' | 'pos' | 'simulator' | 'future';
export type ChannelEnvironment = 'production' | 'sandbox' | 'simulation' | 'development' | 'planned';
export type ChannelConnectionStatus = 'connected' | 'disconnected' | 'pending_authorization' | 'error';
export type ChannelHealthStatus = 'healthy' | 'degraded' | 'unknown';
export type ChannelMappingStatus = 'mapped' | 'unmapped' | 'conflict';

export interface ChannelMapping {
  id: string;
  externalProduct: string;
  externalProductId: string;
  externalVariant: string;
  externalVariantId: string;
  channelSku: string;
  canonicalProduct?: string;
  canonicalSku?: string;
  status: ChannelMappingStatus;
}

export interface SalesChannel {
  id: string;
  name: string;
  subtitle: string;
  kind: ChannelKind;
  environment: ChannelEnvironment;
  connectionStatus: ChannelConnectionStatus;
  healthStatus: ChannelHealthStatus;
  iconLabel: string;
  colorClass: string;
  summary: string;
  lastSyncAt: string | null;
  lastError?: string;
  mappings: { total: number; mapped: number; unmapped: number; conflicts: number };
  facts: Array<{ label: string; value: string }>;
  permissions: string[];
  mappingRows: ChannelMapping[];
}

export interface ChannelFilters {
  query: string;
  kind: 'all' | ChannelKind;
  environment: 'all' | ChannelEnvironment;
  connection: 'all' | ChannelConnectionStatus;
}
