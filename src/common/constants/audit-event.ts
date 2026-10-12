export const AUDIT_EVENT = {
  BOOTSTRAP_COMPLETED: 'bootstrap.completed',
  LOGOUT_REQUESTED: 'logout.requested',
  PROFILE_UPDATED: 'profile.updated',
  PIN_SETUP_SUCCEEDED: 'pin.setup.succeeded',
  PIN_SETUP_FAILED: 'pin.setup.failed',
  PIN_SETUP_REJECTED: 'pin.setup.rejected',
  PIN_VERIFY_SUCCEEDED: 'pin.verify.succeeded',
  PIN_VERIFY_FAILED: 'pin.verify.failed',
  PIN_VERIFY_LOCKED: 'pin.verify.locked',
  PIN_CHANGE_SUCCEEDED: 'pin.change.succeeded',
  PIN_CHANGE_FAILED: 'pin.change.failed',
  PIN_RESET_SUCCEEDED: 'pin.reset.succeeded',
  PIN_RESET_FAILED: 'pin.reset.failed',
  TOKEN_REJECTED: 'token.rejected',
  ACCOUNT_STATUS_BLOCKED: 'account.status_blocked',
} as const;

export type AuditEventType = (typeof AUDIT_EVENT)[keyof typeof AUDIT_EVENT];
