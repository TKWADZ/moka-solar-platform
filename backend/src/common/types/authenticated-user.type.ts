export interface AuthenticatedUser {
  sub: string;
  email: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'STAFF' | 'CUSTOMER';
  customerId?: string | null;
  permissions?: string[];
  roleId?: string | null;
}
