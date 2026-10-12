export const ACCOUNT_STATUS = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  DISABLED: 'disabled',
} as const;

export type AccountStatus = (typeof ACCOUNT_STATUS)[keyof typeof ACCOUNT_STATUS];

export const ACCOUNT_STATUSES = Object.values(ACCOUNT_STATUS) as readonly AccountStatus[];

export function isAccountStatus(value: unknown): value is AccountStatus {
  return typeof value === 'string' && (ACCOUNT_STATUSES as readonly string[]).includes(value);
}

export const USER_ROLE = {
  USER: 'user',
} as const;

export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];

export function isAccountUsable(status: AccountStatus): boolean {
  return status === ACCOUNT_STATUS.ACTIVE;
}
