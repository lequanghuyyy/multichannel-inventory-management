import { useState } from 'react';
import type { AiFeatureRegistry } from '../../../api/ai';
import { ErrorState, LoadingState } from '../../../components/common/ScreenState';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { Card } from '../../../components/ui/Card';

export interface ModelRegistryProps {
  registry: AiFeatureRegistry | null;
  loading: boolean;
  error: unknown;
  retry: () => void;
}

/**
 * The per-feature model registry, read from `GET /api/v1/ai/features`.
 *
 * The important property is the empty state. When a feature has no configured credentials the
 * row says so and offers NO dropdown, because a selector full of models the backend would never
 * call is worse than no selector: it looks configured, and a reader who picks one has learned
 * nothing about whether that model will answer.
 *
 * The control is also read-only here, and says why. Choosing a model is a server-side
 * configuration change (`AI_MODEL_<FEATURE>`), not a per-session preference — a selection the
 * browser dropped on reload would look like a setting and be nothing of the kind.
 */
export function ModelRegistry({ registry, loading, error, retry }: ModelRegistryProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (loading) return <LoadingState label="Đang tải danh sách mô hình…" />;
  if (error) return <ErrorState error={error} retry={retry} />;
  if (!registry) return null;

  const ready = registry.features.filter((feature) => feature.ready).length;

  return (
    <Card className="overflow-hidden p-0">
      <header className="flex flex-col justify-between gap-3 border-b border-outline-variant/50 p-5 sm:flex-row sm:items-center sm:p-6">
        <div>
          <h2 className="font-display text-xl font-bold text-on-surface">Mô hình theo từng tính năng</h2>
          <p className="mt-1 font-body text-body-sm text-graphite">
            {ready} trên {registry.features.length} tính năng đã có mô hình. Tính năng chưa có mô hình thì không có gì để chọn.
          </p>
        </div>
      </header>
      <div className="grid gap-3 p-4">
        {registry.features.map((feature) => (
          <article key={feature.key} className="grid gap-3 rounded-card bg-surface-container-low p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <strong className="font-body text-body-sm text-on-surface">{feature.label}</strong>
                <p className="mt-1 font-body text-caption text-graphite">
                  {feature.ready ? (
                    <>{feature.provider} · <span className="font-mono text-on-surface">{feature.model}</span></>
                  ) : 'Chưa có mô hình'}
                </p>
              </div>
              <StatusBadge tone={feature.ready ? 'success' : 'danger'}>{feature.ready ? 'Sẵn sàng' : 'Chưa kết nối'}</StatusBadge>
            </div>
            {!feature.ready ? (
              <p className="border-t border-outline-variant/50 pt-3 font-body text-caption text-graphite">
                Tính năng này chưa được kết nối với mô hình nào nên chưa có gì để chọn.
              </p>
            ) : feature.candidates.length === 0 ? (
              <p className="border-t border-outline-variant/50 pt-3 font-body text-caption text-graphite">
                Chưa có mô hình thay thế nào.
              </p>
            ) : (
              <>
                <div className="border-t border-outline-variant/50 pt-3">
                  <button
                    type="button"
                    className="font-body text-caption font-semibold text-on-surface"
                    aria-expanded={expanded === feature.key}
                    onClick={() => setExpanded((current) => (current === feature.key ? null : feature.key))}
                  >
                    {expanded === feature.key ? 'Ẩn' : `Xem ${feature.candidates.length} mô hình có thể dùng`}
                  </button>
                  {expanded === feature.key ? (
                    <ul className="mt-2 grid gap-1 font-mono text-caption text-graphite">
                      {feature.candidates.map((candidate) => (
                        <li key={candidate}>{candidate}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <p className="font-body text-caption text-graphite">
                  Việc đổi mô hình do quản trị hệ thống thực hiện, không đổi được tại đây.
                </p>
              </>
            )}
          </article>
        ))}
      </div>
    </Card>
  );
}