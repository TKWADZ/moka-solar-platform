export interface AuthenticatedUser {
  sub: string;
  email?: string | null;
  phone?: string | null;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'STAFF' | 'CUSTOMER';
  customerId?: string | null;
  permissions?: string[];
  roleId?: string | null;
  sid?: string | null;
}
