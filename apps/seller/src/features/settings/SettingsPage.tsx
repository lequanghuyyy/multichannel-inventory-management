import { useState } from 'react';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/ScreenState';
import { getSettingsFixture, type DemoMode } from '../../mocks/mock-api';
import { useMockData } from '../shared/useMockData';
import { AccessSettingsPanel } from './components/AccessSettingsPanel';
import { PreferencesPanel } from './components/PreferencesPanel';
import { SettingsHeader } from './components/SettingsHeader';
import { SettingsNavigation } from './components/SettingsNavigation';
import { StoreSettingsPanel } from './components/StoreSettingsPanel';
import { WarehouseSettingsPanel } from './components/WarehouseSettingsPanel';
import type { SettingsDensity, SettingsSection, SettingsTimeFormat } from './settings.types';

export function SettingsPage({ mode }: { mode: DemoMode }) {
  const fixtureState = useMockData(getSettingsFixture, mode);
  const [section, setSection] = useState<SettingsSection>('store');
  const [density, setDensity] = useState<SettingsDensity>('comfortable');
  const [timeFormat, setTimeFormat] = useState<SettingsTimeFormat>('24-hour');
  const fixture = fixtureState.value;

  let panel;
  if (fixtureState.loading) panel = <LoadingState label="Đang tải cài đặt…" />;
  else if (fixtureState.error) panel = <ErrorState error={fixtureState.error} retry={fixtureState.refresh} />;
  else if (!fixture) panel = <EmptyState title="Chưa có cài đặt" detail="Hiện chưa có thông tin cài đặt nào." />;
  else if (section === 'store') panel = <StoreSettingsPanel store={fixture.store} />;
  else if (section === 'warehouse') panel = <WarehouseSettingsPanel warehouse={fixture.warehouse} />;
  else if (section === 'access') panel = <AccessSettingsPanel density={density} members={fixture.members} />;
  else panel = <PreferencesPanel density={density} timeFormat={timeFormat} onDensityChange={setDensity} onTimeFormatChange={setTimeFormat} />;

  return (
    <section className="mx-auto flex w-full max-w-[1240px] flex-col gap-7 py-8">
      <SettingsHeader />
      <SettingsNavigation value={section} onChange={setSection} />
      <div id={`settings-panel-${section}`} aria-labelledby={`settings-tab-${section}`} role="tabpanel" tabIndex={0}>{panel}</div>
    </section>
  );
}
