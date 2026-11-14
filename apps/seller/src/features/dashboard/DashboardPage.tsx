import { AttentionPanel } from './components/AttentionPanel';
import { DashboardHeader } from './components/DashboardHeader';
import { InventoryHealthCard } from './components/InventoryHealthCard';
import { KpiGrid } from './components/KpiGrid';
import { RecentSyncTable } from './components/RecentSyncTable';
import { SalesByChannelCard } from './components/SalesByChannelCard';
import { SalesOverviewCard } from './components/SalesOverviewCard';

export function DashboardPage() {
  return (
    <section className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 py-8">
      <DashboardHeader />
      <KpiGrid />
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <div className="flex flex-col gap-6 lg:col-span-8">
          <SalesOverviewCard />
          <RecentSyncTable />
        </div>
        <div className="flex flex-col gap-6 lg:col-span-4">
          <AttentionPanel />
          <InventoryHealthCard />
          <SalesByChannelCard />
        </div>
      </div>
    </section>
  );
}
