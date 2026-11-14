export type SettingsSection = 'store' | 'warehouse' | 'access' | 'preferences';
export type SettingsDensity = 'comfortable' | 'compact';
export type SettingsTimeFormat = '24-hour' | '12-hour';

export interface StoreSettingsFixture {
  name: string;
  code: string;
  registeredName: string;
  phone: string;
  email: string;
  address: string;
  timezone: string;
  currency: string;
  defaultChannel: string;
  fulfillmentSource: string;
}

export interface WarehouseMetricFixture {
  id: 'tracked' | 'on-hand' | 'reserved' | 'buffer' | 'ats';
  label: string;
  value: string;
  detail: string;
  emphasis?: boolean;
}

export interface WarehouseSettingsFixture {
  name: string;
  code: string;
  location: string;
  state: string;
  metrics: WarehouseMetricFixture[];
}

export interface AccessMemberFixture {
  id: string;
  initials: string;
  name: string;
  email: string;
  role: 'Admin' | 'Staff';
  status: 'active' | 'suspended';
  lastSession: string;
}

export interface SettingsFixture {
  store: StoreSettingsFixture;
  warehouse: WarehouseSettingsFixture;
  members: AccessMemberFixture[];
}
