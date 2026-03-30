'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Copy,
  ImagePlus,
  LayoutGrid,
  List,
  Search,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { SectionCard } from '@/components/section-card';
import {
  deleteMediaAssetRequest,
  listMediaAssetsRequest,
  updateMediaAssetRequest,
  uploadMediaAssetsRequest,
} from '@/lib/api';
import { cn, formatDateTime } from '@/lib/utils';
import { MediaAssetRecord } from '@/types';

type ViewMode = 'grid' | 'list';

type FilterState = {
  search: string;
  folder: string;
  tag: string;
  dateFrom: string;
  dateTo: string;
};

type AssetFormState = {
  title: string;
  description: string;
  altText: string;
  tags: string;
  folder: string;
};

const defaultFilters: FilterState = {
  search: '',
  folder: '',
  tag: '',
  dateFrom: '',
  dateTo: '',
};

function buildForm(asset: MediaAssetRecord | null): AssetFormState {
  if (!asset) {
    return {
      title: '',
      description: '',
      altText: '',
      tags: '',
      folder: '',
    };
  }

  return {
    title: asset.title || '',
    description: asset.description || '',
    altText: asset.altText || '',
    tags: asset.tags.join(', '),
    folder: asset.folder || '',
  };
}

function formatFileSize(sizeBytes: number) {
  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (sizeBytes >= 1024) {
    return `${Math.round(sizeBytes / 1024)} KB`;
  }

  return `${sizeBytes} B`;
}

export default function AdminMediaPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [assets, setAssets] = useState<MediaAssetRecord[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadFolder, setUploadFolder] = useState('');
  const [uploadTags, setUploadTags] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [assetForm, setAssetForm] = useState<AssetFormState>(buildForm(null));
  const [previewAsset, setPreviewAsset] = useState<MediaAssetRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedId) || null,
    [assets, selectedId],
  );

  async function loadAssets(nextSelectedId?: string) {
    const data = await listMediaAssetsRequest(filters);
    setAssets(data);

    const preferredId = nextSelectedId || selectedId;
    const activeAsset = data.find((asset) => asset.id === preferredId);
    const fallbackAsset = activeAsset || data[0] || null;
    setSelectedId(fallbackAsset?.id || '');
    setAssetForm(buildForm(fallbackAsset));
  }

  useEffect(() => {
    loadAssets()
      .catch((nextError) => {
        setError(
          nextError instanceof Error
            ? nextError.message
            : 'Không thể tải thư viện ảnh.',
        );
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setAssetForm(buildForm(selectedAsset));
  }, [selectedAsset]);

  function updateFilter<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function updateAssetField<K extends keyof AssetFormState>(
    key: K,
    value: AssetFormState[K],
  ) {
    setAssetForm((current) => ({ ...current, [key]: value }));
  }

  function handleQueuedFiles(files: FileList | File[]) {
    const normalized = Array.from(files).filter((file) => file.type.startsWith('image/'));
    setUploadFiles((current) => [...current, ...normalized]);
  }

  async function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');

    try {
      await loadAssets();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Không thể lọc thư viện ảnh.');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload() {
    if (!uploadFiles.length) {
      setError('Vui lòng chọn ít nhất một ảnh để tải lên.');
      return;
    }

    setUploading(true);
    setMessage('');
    setError('');

    try {
      const formData = new FormData();

      uploadFiles.forEach((file) => {
        formData.append('files', file);
      });

      if (uploadFolder.trim()) {
        formData.append('folder', uploadFolder.trim());
      }

      if (uploadTags.trim()) {
        formData.append('tags', uploadTags.trim());
      }

      const uploaded = await uploadMediaAssetsRequest(formData);
      setUploadFiles([]);
      setUploadFolder('');
      setUploadTags('');
      setMessage(`Đã tải lên ${uploaded.length} ảnh vào thư viện.`);
      await loadAssets(uploaded[0]?.id);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Không thể tải ảnh lên.');
    } finally {
      setUploading(false);
    }
  }

  async function handleSaveAsset() {
    if (!selectedAsset) {
      return;
    }

    setSaving(true);
    setMessage('');
    setError('');

    try {
      const updated = await updateMediaAssetRequest(selectedAsset.id, assetForm);
      setAssets((current) => current.map((asset) => (asset.id === updated.id ? updated : asset)));
      setSelectedId(updated.id);
      setAssetForm(buildForm(updated));
      setMessage('Đã cập nhật thông tin ảnh.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Không thể cập nhật ảnh.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAsset() {
    if (!selectedAsset) {
      return;
    }

    const confirmed = window.confirm(`Xóa ảnh "${selectedAsset.title || selectedAsset.originalName}"?`);
    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setMessage('');
    setError('');

    try {
      await deleteMediaAssetRequest(selectedAsset.id);
      await loadAssets();
      setMessage('Đã xóa ảnh khỏi thư viện.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Không thể xóa ảnh.');
    } finally {
      setDeleting(false);
    }
  }

  async function handleCopyUrl(asset: MediaAssetRecord) {
    try {
      await navigator.clipboard.writeText(new URL(asset.fileUrl, window.location.origin).toString());
      setMessage('Đã sao chép đường dẫn ảnh.');
      setError('');
    } catch {
      setError('Không thể sao chép đường dẫn ảnh trên trình duyệt này.');
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="portal-card p-5">
          <p className="text-sm text-slate-400">Tài sản media</p>
          <p className="mt-3 text-3xl font-semibold text-white">{assets.length}</p>
        </div>
        <div className="portal-card p-5">
          <p className="text-sm text-slate-400">Tổng dung lượng</p>
          <p className="mt-3 break-words text-3xl font-semibold text-white">
            {formatFileSize(assets.reduce((total, asset) => total + asset.sizeBytes, 0))}
          </p>
        </div>
        <div className="portal-card p-5">
          <p className="text-sm text-slate-400">Thư mục đang dùng</p>
          <p className="mt-3 text-3xl font-semibold text-white">
            {new Set(assets.map((asset) => asset.folder).filter(Boolean)).size}
          </p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <div className="space-y-5">
          <SectionCard title="Bộ lọc và tải ảnh" eyebrow="Quản lý thư viện hình ảnh" dark>
            <div className="grid gap-4">
              <form onSubmit={handleSearchSubmit} className="grid gap-4">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                  <label className="grid gap-2 text-sm text-slate-300 xl:col-span-2">
                    <span>Tìm kiếm</span>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                      <input
                        className="portal-field pl-11"
                        value={filters.search}
                        onChange={(event) => updateFilter('search', event.target.value)}
                        placeholder="Tên file, tiêu đề, mô tả..."
                      />
                    </div>
                  </label>
                  <label className="grid gap-2 text-sm text-slate-300">
                    <span>Thư mục</span>
                    <input
                      className="portal-field"
                      value={filters.folder}
                      onChange={(event) => updateFilter('folder', event.target.value)}
                      placeholder="Ví dụ: hero"
                    />
                  </label>
                  <label className="grid gap-2 text-sm text-slate-300">
                    <span>Tag</span>
                    <input
                      className="portal-field"
                      value={filters.tag}
                      onChange={(event) => updateFilter('tag', event.target.value)}
                      placeholder="roof, villa..."
                    />
                  </label>
                  <div className="grid gap-4 sm:grid-cols-2 xl:col-span-1 xl:grid-cols-1">
                    <label className="grid gap-2 text-sm text-slate-300">
                      <span>Từ ngày</span>
                      <input
                        type="date"
                        className="portal-field"
                        value={filters.dateFrom}
                        onChange={(event) => updateFilter('dateFrom', event.target.value)}
                      />
                    </label>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
                  <label className="grid gap-2 text-sm text-slate-300">
                    <span>Đến ngày</span>
                    <input
                      type="date"
                      className="portal-field"
                      value={filters.dateTo}
                      onChange={(event) => updateFilter('dateTo', event.target.value)}
                    />
                  </label>

                  <div className="flex flex-wrap items-end gap-3">
                    <button type="submit" className="btn-primary">
                      Áp dụng bộ lọc
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => {
                        setFilters(defaultFilters);
                        setLoading(true);
                        setMessage('');
                        setError('');
                        listMediaAssetsRequest()
                          .then((data) => {
                            setAssets(data);
                            setSelectedId(data[0]?.id || '');
                            setAssetForm(buildForm(data[0] || null));
                          })
                          .catch((nextError) => {
                            setError(
                              nextError instanceof Error
                                ? nextError.message
                                : 'Không thể tải lại thư viện ảnh.',
                            );
                          })
                          .finally(() => setLoading(false));
                      }}
                    >
                      Xóa lọc
                    </button>
                  </div>
                </div>
              </form>

              <div
                onDragEnter={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  setDragActive(false);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragActive(false);
                  handleQueuedFiles(event.dataTransfer.files);
                }}
                className={cn(
                  'rounded-[24px] border border-dashed p-5 transition',
                  dragActive
                    ? 'border-amber-300/60 bg-amber-400/10'
                    : 'border-white/12 bg-white/[0.03]',
                )}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-white">Kéo thả ảnh vào đây hoặc chọn từ máy</p>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      Hỗ trợ JPG, PNG, WebP, SVG, GIF. Mỗi ảnh tối đa 8 MB.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button type="button" className="btn-ghost" onClick={() => inputRef.current?.click()}>
                      <ImagePlus className="h-4 w-4" />
                      Chọn ảnh
                    </button>
                    <button type="button" className="btn-primary" disabled={uploading} onClick={() => void handleUpload()}>
                      <UploadCloud className="h-4 w-4" />
                      {uploading ? 'Đang tải lên...' : 'Tải lên thư viện'}
                    </button>
                  </div>
                </div>

                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    if (event.target.files) {
                      handleQueuedFiles(event.target.files);
                    }
                  }}
                />

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2 text-sm text-slate-300">
                    <span>Thư mục gợi ý</span>
                    <input
                      className="portal-field"
                      value={uploadFolder}
                      onChange={(event) => setUploadFolder(event.target.value)}
                      placeholder="hero, projects, pricing..."
                    />
                  </label>
                  <label className="grid gap-2 text-sm text-slate-300">
                    <span>Tag gợi ý</span>
                    <input
                      className="portal-field"
                      value={uploadTags}
                      onChange={(event) => setUploadTags(event.target.value)}
                      placeholder="roof, villa, battery"
                    />
                  </label>
                </div>

                {uploadFiles.length ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {uploadFiles.map((file, index) => (
                      <span
                        key={`${file.name}-${index}`}
                        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-xs text-slate-200"
                      >
                        {file.name}
                        <button
                          type="button"
                          onClick={() =>
                            setUploadFiles((current) => current.filter((_, currentIndex) => currentIndex !== index))
                          }
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              {message ? (
                <div className="rounded-[20px] border border-emerald-300/15 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
                  {message}
                </div>
              ) : null}

              {error ? (
                <div className="rounded-[20px] border border-rose-300/15 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                  {error}
                </div>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard title="Thư viện ảnh" eyebrow="Grid và danh sách ảnh đã lưu" dark>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-400">
                {loading ? 'Đang tải dữ liệu...' : `${assets.length} ảnh trong thư viện`}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={cn('btn-ghost px-4', viewMode === 'grid' && 'border-white/30 bg-white/10')}
                  onClick={() => setViewMode('grid')}
                >
                  <LayoutGrid className="h-4 w-4" />
                  Lưới
                </button>
                <button
                  type="button"
                  className={cn('btn-ghost px-4', viewMode === 'list' && 'border-white/30 bg-white/10')}
                  onClick={() => setViewMode('list')}
                >
                  <List className="h-4 w-4" />
                  Danh sách
                </button>
              </div>
            </div>

            {loading ? (
              <div className="portal-card-soft p-5 text-sm text-slate-300">Đang tải thư viện ảnh...</div>
            ) : assets.length ? (
              viewMode === 'grid' ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {assets.map((asset) => {
                    const active = asset.id === selectedId;
                    return (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() => setSelectedId(asset.id)}
                        className={cn(
                          'gallery-card text-left transition',
                          active ? 'ring-2 ring-amber-300/70' : 'hover:border-white/20',
                        )}
                      >
                        <img
                          src={asset.previewUrl}
                          alt={asset.altText || asset.title || asset.originalName}
                          className="h-44 w-full object-cover"
                        />
                        <div className="space-y-2 p-4">
                          <p className="line-clamp-1 text-sm font-semibold text-white">
                            {asset.title || asset.originalName}
                          </p>
                          <p className="text-xs text-slate-400">{formatFileSize(asset.sizeBytes)}</p>
                          <div className="flex flex-wrap gap-2">
                            {asset.folder ? (
                              <span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-1 text-[11px] text-slate-300">
                                {asset.folder}
                              </span>
                            ) : null}
                            {asset.tags.slice(0, 2).map((tag) => (
                              <span key={tag} className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-1 text-[11px] text-slate-300">
                                #{tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="overflow-hidden rounded-[24px] border border-white/10">
                  <div className="overflow-x-auto">
                    <table className="min-w-[880px] w-full text-left">
                      <thead className="border-b border-white/10 text-[11px] uppercase tracking-[0.2em] text-slate-500">
                        <tr>
                          <th className="px-4 py-4 font-semibold">Ảnh</th>
                          <th className="px-4 py-4 font-semibold">Thư mục</th>
                          <th className="px-4 py-4 font-semibold">Tag</th>
                          <th className="px-4 py-4 font-semibold">Dung lượng</th>
                          <th className="px-4 py-4 font-semibold">Tải lên</th>
                        </tr>
                      </thead>
                      <tbody>
                        {assets.map((asset) => (
                          <tr
                            key={asset.id}
                            className={cn(
                              'cursor-pointer border-b border-white/6 transition hover:bg-white/[0.03]',
                              asset.id === selectedId && 'bg-white/[0.06]',
                            )}
                            onClick={() => setSelectedId(asset.id)}
                          >
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-3">
                                <img
                                  src={asset.previewUrl}
                                  alt={asset.altText || asset.title || asset.originalName}
                                  className="h-14 w-14 rounded-2xl object-cover"
                                />
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-white">
                                    {asset.title || asset.originalName}
                                  </p>
                                  <p className="truncate text-xs text-slate-400">{asset.originalName}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-300">{asset.folder || '-'}</td>
                            <td className="px-4 py-4 text-sm text-slate-300">{asset.tags.join(', ') || '-'}</td>
                            <td className="px-4 py-4 text-sm font-medium text-white">{formatFileSize(asset.sizeBytes)}</td>
                            <td className="px-4 py-4 text-sm text-slate-300">{formatDateTime(asset.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            ) : (
              <div className="portal-card-soft p-6 text-sm leading-6 text-slate-300">
                Thư viện chưa có ảnh nào. Hãy tải ảnh đầu tiên lên để dùng cho website, CMS hoặc phần cấu hình thương hiệu.
              </div>
            )}
          </SectionCard>
        </div>

        <SectionCard title="Chi tiết ảnh" eyebrow="Sửa metadata và sao chép đường dẫn dùng lại" dark>
          {selectedAsset ? (
            <div className="space-y-5">
              <div className="gallery-card">
                <button type="button" className="block w-full" onClick={() => setPreviewAsset(selectedAsset)}>
                  <img
                    src={selectedAsset.previewUrl}
                    alt={selectedAsset.altText || selectedAsset.title || selectedAsset.originalName}
                    className="max-h-[320px] w-full object-cover"
                  />
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="portal-card-soft p-4">
                  <p className="text-sm text-slate-400">Tên file</p>
                  <p className="mt-2 break-all text-sm font-semibold text-white">{selectedAsset.originalName}</p>
                </div>
                <div className="portal-card-soft p-4">
                  <p className="text-sm text-slate-400">Đường dẫn</p>
                  <p className="mt-2 break-all text-sm font-semibold text-white">{selectedAsset.fileUrl}</p>
                </div>
              </div>

              <div className="grid gap-4">
                <label className="grid gap-2 text-sm text-slate-300">
                  <span>Tiêu đề ảnh</span>
                  <input
                    className="portal-field"
                    value={assetForm.title}
                    onChange={(event) => updateAssetField('title', event.target.value)}
                  />
                </label>
                <label className="grid gap-2 text-sm text-slate-300">
                  <span>Mô tả</span>
                  <textarea
                    className="portal-field min-h-[96px]"
                    value={assetForm.description}
                    onChange={(event) => updateAssetField('description', event.target.value)}
                  />
                </label>
                <label className="grid gap-2 text-sm text-slate-300">
                  <span>Alt text</span>
                  <input
                    className="portal-field"
                    value={assetForm.altText}
                    onChange={(event) => updateAssetField('altText', event.target.value)}
                  />
                </label>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2 text-sm text-slate-300">
                    <span>Tag</span>
                    <input
                      className="portal-field"
                      value={assetForm.tags}
                      onChange={(event) => updateAssetField('tags', event.target.value)}
                      placeholder="roof, villa, battery"
                    />
                  </label>
                  <label className="grid gap-2 text-sm text-slate-300">
                    <span>Thư mục</span>
                    <input
                      className="portal-field"
                      value={assetForm.folder}
                      onChange={(event) => updateAssetField('folder', event.target.value)}
                    />
                  </label>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <button type="button" className="btn-primary" disabled={saving} onClick={() => void handleSaveAsset()}>
                  {saving ? 'Đang lưu...' : 'Lưu metadata'}
                </button>
                <button type="button" className="btn-ghost" onClick={() => void handleCopyUrl(selectedAsset)}>
                  <Copy className="h-4 w-4" />
                  Sao chép URL
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setPreviewAsset(selectedAsset)}
                >
                  Xem toàn ảnh
                </button>
                <button
                  type="button"
                  className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full border border-rose-300/20 bg-rose-400/10 px-5 py-3 text-sm font-semibold text-rose-100 transition hover:bg-rose-400/15"
                  disabled={deleting}
                  onClick={() => void handleDeleteAsset()}
                >
                  <Trash2 className="h-4 w-4" />
                  {deleting ? 'Đang xóa...' : 'Xóa ảnh'}
                </button>
              </div>
            </div>
          ) : (
            <div className="portal-card-soft p-6 text-sm leading-6 text-slate-300">
              Chọn một ảnh trong thư viện để xem preview, sửa metadata hoặc sao chép URL dùng cho logo, banner, bài viết và các khối nội dung khác.
            </div>
          )}
        </SectionCard>

        {previewAsset ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/88 px-4 py-6 backdrop-blur-sm">
            <div className="relative w-full max-w-5xl overflow-hidden rounded-[28px] border border-white/10 bg-[#08111f] shadow-[0_40px_140px_rgba(2,6,23,0.7)]">
              <button
                type="button"
                className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-slate-950/60 text-white"
                onClick={() => setPreviewAsset(null)}
              >
                <X className="h-5 w-5" />
              </button>

              <div className="grid gap-0 lg:grid-cols-[minmax(0,1.2fr)_360px]">
                <div className="bg-black/40">
                  <img
                    src={previewAsset.fileUrl}
                    alt={previewAsset.altText || previewAsset.title || previewAsset.originalName}
                    className="max-h-[78vh] w-full object-contain"
                  />
                </div>
                <div className="space-y-4 p-5">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Preview</p>
                  <h3 className="text-xl font-semibold text-white">
                    {previewAsset.title || previewAsset.originalName}
                  </h3>
                  <div className="grid gap-3 text-sm text-slate-300">
                    <p><span className="text-slate-500">Tên file:</span> {previewAsset.originalName}</p>
                    <p><span className="text-slate-500">Dung lượng:</span> {formatFileSize(previewAsset.sizeBytes)}</p>
                    <p><span className="text-slate-500">Tải lên:</span> {formatDateTime(previewAsset.createdAt)}</p>
                    <p><span className="text-slate-500">Folder:</span> {previewAsset.folder || '-'}</p>
                    <p><span className="text-slate-500">Tag:</span> {previewAsset.tags.join(', ') || '-'}</p>
                  </div>
                  <div className="cta-row">
                    <button type="button" className="btn-primary" onClick={() => void handleCopyUrl(previewAsset)}>
                      Sao chép URL
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => setPreviewAsset(null)}>
                      Đóng preview
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
