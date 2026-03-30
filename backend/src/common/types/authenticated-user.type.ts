export interface AuthenticatedUser {
  sub: string;
  email: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'STAFF' | 'CUSTOMER';
  customerId?: string | null;
}
