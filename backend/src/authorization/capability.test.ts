import { describe, expect, it } from 'vitest';
import { Capability, hasCapability, roleCapabilities } from './capability';

describe('role capabilities', () => {
  it('keeps external access task-scoped', () => {
    expect(roleCapabilities.external).toContain(Capability.WorkOrdersComplete);
    expect(roleCapabilities.external).not.toContain(
      Capability.OrganizationManage,
    );
    expect(roleCapabilities.external).not.toContain(Capability.AuditView);
  });
});

describe('hasCapability', () => {
  it('grants defect creation to members', () => {
    expect(hasCapability('member', false, Capability.DefectsCreate)).toBe(true);
  });

  it('denies defect creation to viewers', () => {
    expect(hasCapability('viewer', false, Capability.DefectsCreate)).toBe(
      false,
    );
  });

  it('denies assignment to members', () => {
    expect(hasCapability('member', false, Capability.DefectsAssign)).toBe(
      false,
    );
  });

  it('treats external members as the external role regardless of stored role', () => {
    expect(hasCapability('admin', true, Capability.OrganizationManage)).toBe(
      false,
    );
    expect(hasCapability('admin', true, Capability.DefectsCreate)).toBe(true);
  });

  it('denies unknown roles', () => {
    expect(hasCapability('robot', false, Capability.DefectsCreate)).toBe(false);
  });
});
