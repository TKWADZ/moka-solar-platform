'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { SectionCard } from '@/components/section-card';
import { StatCard } from '@/components/stat-card';
import {
  createUserRequest,
  listRolesRequest,
  listUsersRequest,
  updateUserRequest,
} from '@/lib/api';
import { cn, formatDateTime } from '@/lib/utils';
import { RoleRecord, StatCardItem, UserRecord, UserRole } from '@/types';

type UserFormState = {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  roleCode: UserRole;
};

type FieldErrors = Partial<Record<keyof UserFormState, string>>;

function emptyForm(): UserFormState {
  return {
    fullName: '',
    email: '',
    phone: '',
    password: '',
    roleCode: 'STAFF',
  };
}

function buildForm(user: UserRecord | null): UserFormState {
  if (!user) {
    return emptyForm();
  }

  return {
    fullName: user.fullName || '',
    email: user.email || '',
    phone: user.phone || '',
    password: '',
    roleCode: (user.role?.code || 'STAFF') as UserRole,
  };
}

function validateForm(form: UserFormState, mode: 'create' | 'edit') {
  const errors: FieldErrors = {};

  if (!form.fullName.trim()) {
    errors.fullName = 'Vui lòng nhập họ tên.';
  }

  if (!form.email.trim()) {
    errors.email = 'Vui lòng nhập email.';
  } else if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) {
    errors.email = 'Email chưa đúng định dạng.';
  }

  if (mode === 'create' && form.password.trim().length < 6) {
    errors.password = 'Mật khẩu tối thiểu 6 ký tự.';
  }

  return errors;
}

function roleLabel(role?: string | null) {
  switch (role) {
    case 'SUPER_ADMIN':
      return 'Super admin';
    case 'ADMIN':
      return 'Admin';
    case 'STAFF':
      return 'Nhân viên';
    case 'CUSTOMER':
      return 'Khách hàng';
    default:
      return role || 'Chưa gán';
  }
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [mode, setMode] = useState<'create' | 'edit'>('edit');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<UserFormState>(emptyForm());
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedId) || null,
    [users, selectedId],
  );

  const filteredUsers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      return users;
    }

    return users.filter((user) =>
      [user.fullName, user.email, user.phone, user.role?.code, user.role?.name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(keyword),
    );
  }, [search, users]);

  const stats = useMemo<StatCardItem[]>(() => {
    const adminCount = users.filter((user) => ['SUPER_ADMIN', 'ADMIN'].includes(user.role?.code || '')).length;
    const staffCount = users.filter((user) => user.role?.code === 'STAFF').length;
    const customerCount = users.filter((user) => user.role?.code === 'CUSTOMER').length;

    return [
      {
        title: 'Tổng tài khoản',
        value: String(users.length),
        subtitle: 'Tài khoản đang hoạt động trong portal',
        delta: `${roles.length} vai trò đã cấu hình`,
        trend: 'up',
      },
      {
        title: 'Quản trị và điều hành',
        value: String(adminCount),
        subtitle: 'Super admin và admin',
        delta: `${staffCount} nhân viên đang được phân quyền`,
        trend: 'neutral',
      },
      {
        title: 'Tài khoản khách hàng',
        value: String(customerCount),
        subtitle: 'Portal customer liên kết với billing và hệ thống',
        delta: customerCount ? 'Đang vận hành' : 'Chưa có tài khoản customer',
        trend: customerCount ? 'up' : 'neutral',
      },
    ];
  }, [roles.length, users]);

  async function loadData(nextSelectedId?: string) {
    const [nextUsers, nextRoles] = await Promise.all([listUsersRequest(), listRolesRequest()]);
    setUsers(nextUsers);
    setRoles(nextRoles as RoleRecord[]);

    const fallbackId = nextSelectedId || nextUsers[0]?.id || '';
    setSelectedId(fallbackId);

    if (mode === 'edit') {
      setForm(buildForm(nextUsers.find((user) => user.id === fallbackId) || null));
    }
  }

  useEffect(() => {
    loadData()
      .catch((nextError) =>
        setError(nextError instanceof Error ? nextError.message : 'Không thể tải danh sách người dùng.'),
      )
      .finally(() => setLoading(false));
  }, []);

  function updateField<K extends keyof UserFormState>(key: K, value: UserFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  }

  async function handleSubmit() {
    const nextErrors = validateForm(form, mode);
    setFieldErrors(nextErrors);
    setMessage('');
    setError('');

    if (Object.keys(nextErrors).length) {
      return;
    }

    setSaving(true);
    const payload = {
      fullName: form.fullName.trim(),
      email: form.email.trim().toLowerCase(),
      ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
      ...(form.password.trim() ? { password: form.password.trim() } : {}),
      roleCode: form.roleCode,
    };

    try {
      if (mode === 'create') {
        const created = await createUserRequest({
          ...payload,
          password: form.password.trim(),
        });
        await loadData(created.id);
        setMode('edit');
        setMessage('Đã tạo tài khoản mới thành công.');
      } else if (selectedUser) {
        await updateUserRequest(selectedUser.id, payload);
        await loadData(selectedUser.id);
        setMessage('Đã cập nhật vai trò và thông tin tài khoản.');
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Không thể lưu tài khoản.');
    } finally {
      setSaving(false);
    }
  }

  function handleCreateMode() {
    setMode('create');
    setSelectedId('');
    setForm(emptyForm());
    setFieldErrors({});
    setMessage('');
    setError('');
  }

  function handleSelectUser(user: UserRecord) {
    setMode('edit');
    setSelectedId(user.id);
    setForm(buildForm(user));
    setFieldErrors({});
    setMessage('');
    setError('');
  }

  if (loading) {
    return (
      <SectionCard title="Người dùng và vai trò" eyebrow="Phân quyền portal" dark>
        <p className="text-sm text-slate-300">Đang tải danh sách tài khoản...</p>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-3">
        {stats.map((item) => (
          <StatCard key={item.title} {...item} dark />
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(320px,0.86fr)_minmax(0,1.14fr)]">
        <SectionCard
          title="Danh sách tài khoản"
          eyebrow="Super admin, admin, staff và customer"
          dark
        >
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <input
                className="portal-field min-w-[220px] flex-1"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tìm theo tên, email hoặc vai trò"
              />
              <button type="button" className="btn-ghost" onClick={() => void loadData(selectedId)}>
                <RefreshCw className="h-4 w-4" />
                Làm mới
              </button>
              <button type="button" className="btn-primary" onClick={handleCreateMode}>
                <Plus className="h-4 w-4" />
                Tạo tài khoản
              </button>
            </div>

            <div className="grid gap-3">
              {filteredUsers.map((user) => {
                const active = mode === 'edit' && selectedId === user.id;
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => handleSelectUser(user)}
                    className={cn(
                      'portal-card-soft w-full p-4 text-left transition',
                      active && 'border border-emerald-300/20 bg-emerald-400/10',
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white">{user.fullName}</p>
                        <p className="mt-1 text-sm text-slate-400">{user.email}</p>
                      </div>
                      <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-200">
                        {roleLabel(user.role?.code)}
                      </span>
                    </div>
                    <p className="mt-3 text-xs text-slate-500">
                      Cập nhật lần cuối {formatDateTime(user.updatedAt)}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title={mode === 'create' ? 'Tạo tài khoản mới' : 'Cập nhật tài khoản'}
          eyebrow="Gán vai trò và quyền truy cập"
          dark
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm text-slate-300">
              <span>Họ tên</span>
              <input
                className={cn('portal-field', fieldErrors.fullName && 'border-rose-300/40')}
                value={form.fullName}
                onChange={(event) => updateField('fullName', event.target.value)}
                placeholder="Ví dụ: Nguyễn Văn A"
              />
              {fieldErrors.fullName ? <span className="text-xs text-rose-300">{fieldErrors.fullName}</span> : null}
            </label>

            <label className="grid gap-2 text-sm text-slate-300">
              <span>Email</span>
              <input
                className={cn('portal-field', fieldErrors.email && 'border-rose-300/40')}
                value={form.email}
                onChange={(event) => updateField('email', event.target.value)}
                placeholder="name@company.vn"
              />
              {fieldErrors.email ? <span className="text-xs text-rose-300">{fieldErrors.email}</span> : null}
            </label>

            <label className="grid gap-2 text-sm text-slate-300">
              <span>Số điện thoại</span>
              <input
                className="portal-field"
                value={form.phone}
                onChange={(event) => updateField('phone', event.target.value)}
                placeholder="0900 000 000"
              />
            </label>

            <label className="grid gap-2 text-sm text-slate-300">
              <span>Vai trò</span>
              <select
                className="portal-field"
                value={form.roleCode}
                onChange={(event) => updateField('roleCode', event.target.value as UserRole)}
              >
                {roles.map((role) => (
                  <option key={role.id} value={role.code}>
                    {roleLabel(role.code)}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm text-slate-300 md:col-span-2">
              <span>{mode === 'create' ? 'Mật khẩu khởi tạo' : 'Đặt lại mật khẩu (không bắt buộc)'}</span>
              <input
                type="password"
                className={cn('portal-field', fieldErrors.password && 'border-rose-300/40')}
                value={form.password}
                onChange={(event) => updateField('password', event.target.value)}
                placeholder={mode === 'create' ? 'Nhập mật khẩu tối thiểu 6 ký tự' : 'Bỏ trống nếu không đổi'}
              />
              {fieldErrors.password ? <span className="text-xs text-rose-300">{fieldErrors.password}</span> : null}
            </label>
          </div>

          {message ? (
            <div className="mt-4 rounded-[20px] border border-emerald-300/15 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
              {message}
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-[20px] border border-rose-300/15 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
              {error}
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" className="btn-primary" disabled={saving} onClick={() => void handleSubmit()}>
              {saving ? 'Đang lưu...' : mode === 'create' ? 'Tạo tài khoản' : 'Lưu thay đổi'}
            </button>
            {mode === 'create' ? (
              <button type="button" className="btn-ghost" onClick={() => setMode('edit')}>
                Hủy
              </button>
            ) : null}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
