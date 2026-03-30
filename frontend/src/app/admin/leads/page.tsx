'use client';

import { useEffect, useMemo, useState } from 'react';
import { SectionCard } from '@/components/section-card';
import {
  listContactInquiriesRequest,
  updateContactInquiryRequest,
} from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { ContactInquiryRecord, ContactInquiryStatus } from '@/types';

const statusOptions: ContactInquiryStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'CLOSED'];

function leadStatusLabel(status: ContactInquiryStatus) {
  switch (status) {
    case 'NEW':
      return 'Mới';
    case 'CONTACTED':
      return 'Đã liên hệ';
    case 'QUALIFIED':
      return 'Đã đánh giá';
    case 'CLOSED':
      return 'Đã đóng';
    default:
      return status;
  }
}

export default function AdminLeadsPage() {
  const [rows, setRows] = useState<ContactInquiryRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [noteDraft, setNoteDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    listContactInquiriesRequest()
      .then((items) => {
        setRows(items);
        if (items[0]) {
          setSelectedId(items[0].id);
          setNoteDraft(items[0].internalNote || '');
        }
      })
      .catch(() => setRows([]));
  }, []);

  const selectedLead = useMemo(
    () => rows.find((item) => item.id === selectedId) || rows[0] || null,
    [rows, selectedId],
  );

  useEffect(() => {
    if (selectedLead) {
      setNoteDraft(selectedLead.internalNote || '');
    }
  }, [selectedLead?.id]);

  async function updateLead(payload: { status?: ContactInquiryStatus; internalNote?: string }) {
    if (!selectedLead) {
      return;
    }

    setSaving(true);
    setMessage('');
    setError('');

    try {
      const updated = await updateContactInquiryRequest(selectedLead.id, payload);
      setRows((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setMessage('Đã cập nhật lead.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Không thể cập nhật lead.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <SectionCard title="Hàng chờ lead" eyebrow="Yêu cầu tư vấn từ website" dark>
        <div className="grid gap-3">
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => setSelectedId(row.id)}
              className={`rounded-[22px] border p-4 text-left transition ${
                selectedLead?.id === row.id
                  ? 'border-white/20 bg-white text-slate-950'
                  : 'border-white/10 bg-white/5 text-white hover:bg-white/10'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{row.fullName}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-400">{row.companyName || row.email}</p>
                    </div>
                    <span className="rounded-full border border-current/20 px-3 py-1 text-xs font-semibold">
                      {leadStatusLabel(row.status)}
                    </span>
                  </div>
              <p className="mt-3 line-clamp-2 text-sm text-slate-400">{row.message}</p>
              <p className="mt-3 text-xs text-slate-500">{formatDateTime(row.createdAt)}</p>
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Chi tiết lead" eyebrow="Đánh giá và theo dõi" dark>
        {selectedLead ? (
          <div className="grid gap-4">
            <div className="grid gap-2 rounded-[24px] border border-white/10 bg-white/5 p-5">
              <p className="text-2xl font-semibold text-white">{selectedLead.fullName}</p>
              <p className="text-sm text-slate-300">{selectedLead.companyName || '-'}</p>
              <div className="grid gap-2 text-sm text-slate-300 md:grid-cols-2">
                <p>Email: {selectedLead.email}</p>
                <p>Điện thoại: {selectedLead.phone || '-'}</p>
                <p>Số điểm lắp đặt: {selectedLead.siteCount || '-'}</p>
                <p>Nguồn: {selectedLead.sourcePage}</p>
              </div>
              <p className="rounded-[18px] border border-white/10 bg-slate-950/50 p-4 text-sm text-slate-200">
                {selectedLead.message}
              </p>
            </div>

            <div className="grid gap-3">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Trạng thái</p>
              <div className="flex flex-wrap gap-2">
                {statusOptions.map((status) => (
                  <button
                    key={status}
                    type="button"
                    disabled={saving}
                    onClick={() => void updateLead({ status })}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      selectedLead.status === status
                        ? 'bg-white text-slate-950'
                        : 'bg-white/5 text-slate-200 hover:bg-white/10'
                    }`}
                  >
                    {leadStatusLabel(status)}
                  </button>
                ))}
              </div>
            </div>

            <label className="grid gap-2">
              <span className="text-xs uppercase tracking-[0.22em] text-slate-400">Ghi chú nội bộ</span>
              <textarea
                rows={7}
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                className="rounded-[18px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-emerald-300/40"
                placeholder="Ghi chú mức độ tiềm năng, lịch khảo sát hoặc hành động tiếp theo..."
              />
            </label>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="btn-primary"
                disabled={saving}
                onClick={() => void updateLead({ internalNote: noteDraft })}
              >
                {saving ? 'Đang lưu...' : 'Lưu ghi chú'}
              </button>
            </div>

            {message ? (
              <div className="rounded-[22px] border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
                {message}
              </div>
            ) : null}
            {error ? (
              <div className="rounded-[22px] border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                {error}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-slate-300">Chưa có yêu cầu tư vấn nào.</p>
        )}
      </SectionCard>
    </div>
  );
}
