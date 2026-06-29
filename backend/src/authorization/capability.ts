export enum Capability {
  OrganizationManage = 'organization.manage',
  MembersInvite = 'members.invite',
  TeamsManage = 'teams.manage',
  ProjectsManage = 'projects.manage',
  WorkOrdersCreate = 'work_orders.create',
  WorkOrdersAssign = 'work_orders.assign',
  WorkOrdersComplete = 'work_orders.complete',
  InspectionsPerform = 'inspections.perform',
  InspectionsApprove = 'inspections.approve',
  DefectsCreate = 'defects.create',
  DefectsVerify = 'defects.verify',
  ReportsPublish = 'reports.publish',
  AuditView = 'audit.view',
}

const memberCapabilities = [
  Capability.WorkOrdersComplete,
  Capability.InspectionsPerform,
  Capability.DefectsCreate,
];

export const roleCapabilities: Record<string, readonly Capability[]> = {
  owner: Object.values(Capability),
  admin: Object.values(Capability),
  manager: Object.values(Capability).filter(
    (capability) => capability !== Capability.OrganizationManage,
  ),
  coordinator: [
    Capability.TeamsManage,
    Capability.ProjectsManage,
    Capability.WorkOrdersCreate,
    Capability.WorkOrdersAssign,
    ...memberCapabilities,
  ],
  member: memberCapabilities,
  viewer: [],
  external: memberCapabilities,
};
