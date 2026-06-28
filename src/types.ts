// Wire shapes for the public ProRanked CPMS API (/api/cpms/v1). Field names/types mirror the server DTOs
// (CpmsResponseModels.cs et al). Lenient where the server is loosely typed (analytics rollups).

export interface Paged<T> {
  data: T[];
  pagination?: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface Context {
  accessibleNetworkCount: number;
  scopes: string[];
  keyType?: string | null;
  unrestricted: boolean;
}
export interface NetworkSummary { id: string; name: string }

export interface ChargerSummary {
  id: string; uid: string; status: string;
  networkId: number; locationId?: number | null;
  serialNumber?: string | null; firmwareVersion?: string | null; ocppVersion?: string | null;
  modelUuid?: string | null; manufacturerUuid?: string | null;
  locationName?: string | null; locationUuid?: string | null;
}
export interface ConnectorSummary {
  id: string; number: number; standard: string; format: string;
  powerType: string; maxPowerKw?: number | null; status: string;
}
export interface ChargerDetail extends ChargerSummary {
  maxPowerKw?: number | null; securityProfile: number;
  lastHeartbeat?: string | null; isOnline: boolean;
  connectors: ConnectorSummary[];
}

export interface SessionSummary {
  id: string; status: string; chargerId: number;
  chargerUuid?: string | null; chargerUid?: string | null;
  energyKwh: number; total?: number | null; currency: string;
  startedAt: string; endedAt?: string | null;
}
export interface SessionDetail {
  id: string; status: string; chargerId: number; networkId: number;
  energyKwh: number; currentPowerKw?: number | null;
  total?: number | null; currency: string; startedAt: string; endedAt?: string | null;
}
export interface MeterValue {
  timestamp: string; meterValue: number; powerKw?: number | null; energyWh?: number | null;
  currentA?: number | null; voltageA?: number | null; stateOfCharge?: number | null; temperature?: number | null;
}
export interface SessionEvent { eventType?: string | null; details?: string | null; occurredAt: string }

export interface LocationSummary {
  id: string; name: string; address: string; city: string; state: string; country: string; networkId: number;
}
export interface LocationDetail extends LocationSummary { postalCode: string }

export interface TariffSummary {
  id: string; name: string; type: string; currency: string;
  energyRate?: number | null; timeRate?: number | null; idleRate: number; isFree: boolean;
}
export interface TariffDetail extends TariffSummary {
  sessionFee?: number | null; idleGracePeriodMinutes: number; idleFeeEnabled: boolean;
  idleFeeMaximum?: number | null; taxRate?: number | null;
  peakHoursStart?: string | null; peakHoursEnd?: string | null;
  peakMultiplier?: number | null; weekendMultiplier?: number | null;
}
export interface TariffAssignment { assignmentId: string; scope?: string; locationName?: string; chargerUid?: string; [k: string]: unknown }

export interface TxSummary {
  id: string; ocpiId?: string | null; sessionId?: string | null; chargerUid?: string | null;
  locationName?: string | null; startTime: string; endTime: string; energyKwh: number;
  amount: number; currency?: string | null; paymentStatus?: string | null;
  totalCosts: number; grossProfit: number; netProfit: number; profitMarginPercent: number; isFree: boolean;
}

export interface Kpis {
  metric: string; from: string; to: string;
  totalSessions: number; totalEnergyKwh: number; totalRevenue: number; avgDurationMinutes: number; networkCount: number;
}
export interface Uptime {
  metric: string; totalChargers: number; available: number; charging: number; offline: number;
  uptimePercent: number; offlinePercent: number; networkCount: number;
}
export interface AnalyticsRollup {
  metric: string; period: string; from: string; to: string;
  totalRevenue?: number; totalEnergyKwh?: number; totalSessions?: number; averageUtilization?: number;
  networkCount: number;
  networks: { networkId: string; rollup?: Record<string, unknown> | null }[];
}

export interface ChargerCommand { action?: string | null; status?: string | null; responseTimeMs?: number | null; timestamp: string; sentBy?: string | null; correlationId?: string | null }
export interface DeviceModelVar { componentName?: string | null; variableName?: string | null; attributeType?: string | null; attributeValue?: string | null; mutability?: string | null; dataType?: string | null; unit?: string | null; evseId?: number | null }
export interface Certificate { id: string; serialNumber?: string | null; subjectCN?: string | null; issuerCN?: string | null; notBefore: string; notAfter: string; status?: string | null; source?: string | null }
export interface ChargingProfile { assignmentId: number; profileId: number; isActive: boolean; startDate?: string | null; endDate?: string | null; profile?: { name?: string | null; profileType?: string | null; recurrenceType?: string | null; priority: number; minPowerKw?: number | null; maxPowerKw?: number | null; profileData?: string | null } | null }
export interface MonitoringEvent { [k: string]: unknown }

export interface Webhook { id: string; url?: string; events?: string[]; active?: boolean; status?: string; [k: string]: unknown }
export interface WebhookDelivery { id: string; event?: string; status?: string; statusCode?: number; attemptedAt?: string; [k: string]: unknown }

export interface AuditEntry {
  id: number; category: string; action: string; resourceId?: string | null; resourceName?: string | null;
  description: string; details?: string | null; userId?: string | null; userName?: string | null;
  ipAddress?: string | null; timestamp: string;
}

export interface LimitDimension { tierLimit?: number | null; selfLimit?: number | null; effectiveLimit?: number | null; currentUsage: number; remaining?: number | null }
export interface Limits { planCode: string; chargers: LimitDimension; connectors: LimitDimension }

export interface Manufacturer { id: string; name: string; [k: string]: unknown }
export interface ChargerModel { id: string; name: string; manufacturerId?: string; manufacturerName?: string; [k: string]: unknown }

export interface IncreaseRequest { id: string; resource: string; currentTierLimit?: number | null; requestedLimit: number; status: string; reason?: string | null; createdAt: string; reviewedAt?: string | null; reviewNote?: string | null }
export interface Settings { name?: string; contactEmail?: string; website?: string; country?: string; currency?: string; timezone?: string; branding?: Record<string, unknown>; billing?: Record<string, unknown>; [k: string]: unknown }
export interface TeamMember { id: string; email?: string; name?: string; role?: string; [k: string]: unknown }
export interface ApiKey { id: string; name?: string; prefix?: string; suffix?: string; scopes?: string[]; lastUsedAt?: string | null; createdAt?: string; [k: string]: unknown }
export interface NetworkWallet { balance: number; currency: string; networkId: number; status: string; lastTransactionAt?: string | null }
export interface FraudHold { driverId: string; email?: string | null; phoneVerified?: boolean; reason?: string | null; heldAt?: string | null; outstandingBalance?: number; [k: string]: unknown }
export interface LoadBalancing { enabled?: boolean; strategy?: string; siteMaxPowerKw?: number; safetyMarginPct?: number; currentDrawKw?: number; allocatedKw?: number; evses?: Record<string, unknown>[]; [k: string]: unknown }
