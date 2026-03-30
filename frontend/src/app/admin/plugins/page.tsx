'use client';

import { useEffect, useMemo, useState } from 'react';
import { SectionCard } from '@/components/section-card';
import {
  listFeaturePluginsRequest,
  syncFeaturePluginsRequest,
  updateFeaturePluginRequest,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { FeaturePlugin } from '@/types';

function stringifyConfig(config?: Record<string, unknown> | null) {
  return JSON.stringify(config ?? {}, null, 2);
}

type PluginFormState = {
  name: string;
  description: string;
  category: string;
  version: string;
  routePath: string;
  areas: string;
  installed: boolean;
  enabled: boolean;
  editable: boolean;
  sortOrder: string;
};

function buildFormState(plugin: FeaturePlugin | null): PluginFormState {
  return {
    name: plugin?.name || '',
    description: plugin?.description || '',
    category: plugin?.category || '',
    version: plugin?.version || '',
    routePath: plugin?.routePath || '',
    areas: plugin?.areas.join(', ') || '',
    installed: plugin?.installed || false,
    enabled: plugin?.enabled || false,
    editable: plugin?.editable || false,
    sortOrder: String(plugin?.sortOrder || 0),
  };
}

export default function AdminPluginsPage() {
  const { tt } = useI18n();
  const [plugins, setPlugins] = useState<FeaturePlugin[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [configText, setConfigText] = useState('{}');
  const [formState, setFormState] = useState<PluginFormState>(buildFormState(null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const selectedPlugin = useMemo(
    () => plugins.find((plugin) => plugin.id === selectedId) || null,
    [plugins, selectedId],
  );

  useEffect(() => {
    async function load() {
      try {
        const nextPlugins = await listFeaturePluginsRequest();
        setPlugins(nextPlugins);
        setSelectedId((current) => current || nextPlugins[0]?.id || '');
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'Không thể tải danh mục plugin.');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  useEffect(() => {
    if (selectedPlugin) {
      setConfigText(stringifyConfig(selectedPlugin.config));
      setFormState(buildFormState(selectedPlugin));
    }
  }, [selectedPlugin]);

  async function handleSyncDefaults() {
    setMessage('');
    setError('');

    try {
      const nextPlugins = await syncFeaturePluginsRequest();
      setPlugins(nextPlugins);
      setSelectedId((current) => current || nextPlugins[0]?.id || '');
      setMessage('Đã đồng bộ danh mục plugin với bộ module mặc định.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Không thể đồng bộ cấu hình plugin mặc định.');
    }
  }

  async function handleSave() {
    if (!selectedPlugin) {
      return;
    }

    setSaving(true);
    setMessage('');
    setError('');

    try {
      const parsedConfig = JSON.parse(configText || '{}') as Record<string, unknown>;
      const payload = {
        name: formState.name,
        description: formState.description,
        category: formState.category,
        version: formState.version,
        routePath: formState.routePath || null,
        areas: formState.areas
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        installed: formState.installed,
        enabled: formState.enabled,
        editable: formState.editable,
        sortOrder: Number(formState.sortOrder || 0),
        config: parsedConfig,
      };

      const updated = await updateFeaturePluginRequest(selectedPlugin.id, payload);
      setPlugins((current) =>
        current.map((plugin) => (plugin.id === updated.id ? updated : plugin)),
      );
      setMessage(`Đã lưu plugin "${updated.name}".`);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Không thể lưu cấu hình plugin.',
      );
    } finally {
      setSaving(false);
    }
  }

  const installedCount = plugins.filter((plugin) => plugin.installed).length;
  const enabledCount = plugins.filter((plugin) => plugin.installed && plugin.enabled).length;
  const lockedCount = plugins.filter((plugin) => !plugin.editable).length;
  const editorLocked = !!selectedPlugin && !selectedPlugin.editable;

  if (loading) {
    return (
      <SectionCard title="Trung tâm plugin" eyebrow="Danh mục module" dark>
        <p className="text-sm text-slate-300">Đang tải danh mục plugin...</p>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        {[ 
          { label: 'Plugin đã cài đặt', value: installedCount },
          { label: 'Plugin đang bật', value: enabledCount },
          { label: 'Plugin lõi bị khóa', value: lockedCount },
        ].map((item) => (
          <div key={item.label} className="portal-card p-5">
            <p className="text-sm text-slate-400">{item.label}</p>
            <p className="mt-3 text-3xl font-semibold text-white">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <SectionCard title="Danh mục plugin" eyebrow="Cài đặt, bật tắt và sắp mức ưu tiên" dark>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={handleSyncDefaults} className="btn-primary">
              Đồng bộ mặc định
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {plugins.map((plugin) => {
              const selected = plugin.id === selectedId;

              return (
                <button
                  key={plugin.id}
                  type="button"
                  onClick={() => setSelectedId(plugin.id)}
                  className={`w-full rounded-[24px] border px-4 py-4 text-left transition ${
                    selected
                      ? 'border-white/20 bg-white text-slate-950'
                      : 'border-white/10 bg-white/5 text-white hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold">{plugin.name}</p>
                      <p className={`mt-1 text-sm ${selected ? 'text-slate-600' : 'text-slate-400'}`}>
                        {plugin.description}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          plugin.installed
                            ? selected
                              ? 'bg-slate-950 text-white'
                              : 'bg-emerald-400/15 text-emerald-300'
                            : 'bg-rose-400/15 text-rose-200'
                        }`}
                      >
                        {plugin.installed ? 'Đã cài đặt' : 'Chưa cài đặt'}
                      </span>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          plugin.enabled
                            ? selected
                              ? 'bg-slate-200 text-slate-950'
                              : 'bg-sky-400/15 text-sky-200'
                            : 'bg-amber-400/15 text-amber-200'
                        }`}
                      >
                        {plugin.enabled ? 'Đang bật' : 'Đang tắt'}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard title="Trình chỉnh plugin" eyebrow="Thiết lập runtime do admin kiểm soát" dark>
          {selectedPlugin ? (
            <div className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-sm text-slate-300">
                  <span>Mã plugin</span>
                  <input className="portal-field opacity-70" value={selectedPlugin.key} readOnly />
                </label>
                <label className="grid gap-2 text-sm text-slate-300">
                  <span>Phiên bản</span>
                  <input
                    className="portal-field"
                    value={formState.version}
                    disabled={editorLocked}
                    onChange={(event) => setFormState((current) => ({ ...current, version: event.target.value }))}
                  />
                </label>
              </div>

              <label className="grid gap-2 text-sm text-slate-300">
                <span>Tên hiển thị</span>
                <input
                  className="portal-field"
                  value={formState.name}
                  disabled={editorLocked}
                  onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))}
                />
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                <span>Mô tả</span>
                <textarea
                  className="portal-field min-h-[110px]"
                  value={formState.description}
                  disabled={editorLocked}
                  onChange={(event) => setFormState((current) => ({ ...current, description: event.target.value }))}
                />
              </label>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="grid gap-2 text-sm text-slate-300">
                  <span>Nhóm chức năng</span>
                  <input
                    className="portal-field"
                    value={formState.category}
                    disabled={editorLocked}
                    onChange={(event) => setFormState((current) => ({ ...current, category: event.target.value }))}
                  />
                </label>
                <label className="grid gap-2 text-sm text-slate-300">
                  <span>Route chính</span>
                  <input
                    className="portal-field"
                    value={formState.routePath}
                    disabled={editorLocked}
                    onChange={(event) => setFormState((current) => ({ ...current, routePath: event.target.value }))}
                  />
                </label>
                <label className="grid gap-2 text-sm text-slate-300">
                  <span>Thứ tự hiển thị</span>
                  <input
                    className="portal-field"
                    type="number"
                    value={formState.sortOrder}
                    disabled={editorLocked}
                    onChange={(event) => setFormState((current) => ({ ...current, sortOrder: event.target.value }))}
                  />
                </label>
              </div>

              <label className="grid gap-2 text-sm text-slate-300">
                <span>Khu vực áp dụng</span>
                <input
                  className="portal-field"
                  value={formState.areas}
                  disabled={editorLocked}
                  onChange={(event) => setFormState((current) => ({ ...current, areas: event.target.value }))}
                />
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                <span>Cấu hình JSON</span>
                <textarea
                  className="portal-field min-h-[220px] font-mono text-xs"
                  value={configText}
                  disabled={editorLocked}
                  onChange={(event) => setConfigText(event.target.value)}
                />
              </label>

              <div className="grid gap-3 md:grid-cols-3">
                <label className="portal-card-soft flex items-center justify-between gap-3 p-4 text-sm text-slate-200">
                  <span>Đã cài đặt</span>
                  <input
                    type="checkbox"
                    checked={formState.installed}
                    onChange={(event) => setFormState((current) => ({ ...current, installed: event.target.checked }))}
                    disabled={selectedPlugin.isCore || !selectedPlugin.editable}
                  />
                </label>
                <label className="portal-card-soft flex items-center justify-between gap-3 p-4 text-sm text-slate-200">
                  <span>Đang bật</span>
                  <input
                    type="checkbox"
                    checked={formState.enabled}
                    onChange={(event) => setFormState((current) => ({ ...current, enabled: event.target.checked }))}
                    disabled={selectedPlugin.isCore || !selectedPlugin.editable}
                  />
                </label>
                <label className="portal-card-soft flex items-center justify-between gap-3 p-4 text-sm text-slate-200">
                  <span>Cho phép chỉnh</span>
                  <input
                    type="checkbox"
                    checked={formState.editable}
                    onChange={(event) => setFormState((current) => ({ ...current, editable: event.target.checked }))}
                    disabled={selectedPlugin.isCore}
                  />
                </label>
              </div>

              {message ? <p className="text-sm text-emerald-300">{message}</p> : null}
              {error ? <p className="text-sm text-rose-300">{error}</p> : null}

              <div className="flex flex-wrap gap-3">
                <button type="button" disabled={saving || editorLocked} className="btn-primary" onClick={() => void handleSave()}>
                  {saving ? 'Đang lưu plugin...' : 'Lưu thay đổi'}
                </button>
                <div className="portal-card-soft px-4 py-3 text-sm text-slate-300">
                  {selectedPlugin.editable
                    ? 'Plugin này có thể được chỉnh trực tiếp trong admin.'
                    : 'Plugin này đang bị khóa vì thuộc nhóm điều khiển lõi của nền tảng.'}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-300">Chọn một plugin để bắt đầu chỉnh sửa.</p>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
