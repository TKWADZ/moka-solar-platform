export const STAFF_MAIL_PROVIDER = Symbol('STAFF_MAIL_PROVIDER');

export type StaffPasswordResetMail = {
  to: string;
  resetUrl: string;
  expiresInMinutes: number;
};

export interface StaffMailProvider {
  sendPasswordReset(message: StaffPasswordResetMail): Promise<void>;
}
