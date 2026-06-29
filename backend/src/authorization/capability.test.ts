import { describe, expect, it } from 'vitest';
import { Capability, roleCapabilities } from './capability';

describe('role capabilities', () => {
  it('keeps external access task-scoped', () => {
    expect(roleCapabilities.external).toContain(Capability.WorkOrdersComplete);
    expect(roleCapabilities.external).not.toContain(
      Capability.OrganizationManage,
    );
    expect(roleCapabilities.external).not.toContain(Capability.AuditView);
  });
});
