import { StatusBadge } from '../../../components/common/StatusBadge';
import { Button } from '../../../components/ui/Button';
import { cn } from '../../../lib/cn';
import type { AccessMemberFixture, SettingsDensity } from '../settings.types';

const roleNames = { Admin: 'Quản trị viên', Staff: 'Nhân viên' } as const;

function MemberIdentity({ member }: { member: AccessMemberFixture }) {
  return <div className="flex min-w-0 items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-carbon font-display text-caption font-bold text-pure-white">{member.initials}</span><span className="min-w-0"><strong className="block truncate font-body text-body-sm text-on-surface">{member.name}</strong><code className="block truncate text-caption text-graphite">{member.email}</code></span></div>;
}

export function AccessSettingsPanel({ density, members }: { density: SettingsDensity; members: AccessMemberFixture[] }) {
  const padding = density === 'compact' ? 'py-2.5' : 'py-4';
  return (
    <section className="grid gap-5" aria-labelledby="access-panel-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div className="min-w-0"><p className="font-body text-caption font-bold uppercase tracking-[0.14em] text-graphite">Thiết lập 03</p><h2 className="mt-1 whitespace-nowrap font-display text-2xl font-bold text-on-surface" id="access-panel-title">Danh sách thành viên</h2></div><Button disabled leadingIcon={<span className="material-symbols-outlined text-lg" aria-hidden="true">person_add</span>} className="shrink-0">Mời thành viên</Button></div>
      <div className="overflow-hidden rounded-card border border-outline-variant/60 bg-pure-white shadow-card">
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[760px] border-collapse text-left font-body text-body-sm">
            <caption className="sr-only">Danh sách thành viên mẫu</caption>
            <thead className="bg-surface-container-low text-caption uppercase tracking-[0.1em] text-graphite"><tr><th className="px-5 py-3">Thành viên</th><th className="px-5 py-3">Vai trò</th><th className="px-5 py-3">Trạng thái</th><th className="px-5 py-3">Lần đăng nhập gần nhất</th><th className="px-5 py-3 text-right">Thao tác</th></tr></thead>
            <tbody className="divide-y divide-outline-variant/50">{members.map((member) => <tr key={member.id}><td className={cn('px-5', padding)}><MemberIdentity member={member} /></td><td className="px-5"><StatusBadge tone={member.role === 'Admin' ? 'neutral' : 'warning'}>{roleNames[member.role]}</StatusBadge></td><td className="px-5"><StatusBadge tone={member.status === 'active' ? 'success' : 'warning'}>{member.status === 'active' ? 'Đang hoạt động' : 'Tạm khoá'}</StatusBadge></td><td className="px-5 text-caption text-graphite">{member.lastSession}</td><td className="px-5 text-right"><Button size="sm" variant="ghost" disabled>Đổi vai trò</Button></td></tr>)}</tbody>
          </table>
        </div>
        <div className="grid divide-y divide-outline-variant/50 md:hidden">{members.map((member) => <article className={cn('grid gap-4 px-4', padding)} key={member.id}><MemberIdentity member={member} /><div className="grid grid-cols-2 gap-3"><div><span className="font-body text-caption text-graphite">Vai trò</span><div className="mt-1"><StatusBadge>{roleNames[member.role]}</StatusBadge></div></div><div><span className="font-body text-caption text-graphite">Trạng thái</span><div className="mt-1"><StatusBadge tone={member.status === 'active' ? 'success' : 'warning'}>{member.status === 'active' ? 'Đang hoạt động' : 'Tạm khoá'}</StatusBadge></div></div></div><p className="font-body text-caption text-graphite">{member.lastSession}</p><Button size="sm" variant="secondary" disabled>Đổi vai trò</Button></article>)}</div>
        <div className="grid gap-px bg-outline-variant/50 md:grid-cols-2"><article className="bg-surface-container-low p-5"><p className="font-body text-caption font-bold uppercase tracking-[0.1em] text-graphite">Quyền của quản trị viên</p><p className="mt-2 font-body text-body-sm leading-6 text-on-surface-variant">Cấu hình kênh bán, điều chỉnh tồn kho, thử lại đồng bộ và mời thành viên.</p></article><article className="bg-surface-container-low p-5"><p className="font-body text-caption font-bold uppercase tracking-[0.1em] text-graphite">Quyền của nhân viên</p><p className="mt-2 font-body text-body-sm leading-6 text-on-surface-variant">Bán tại quầy, xem danh mục sản phẩm và tra cứu giao hàng.</p></article></div>
      </div>
    </section>
  );
}
