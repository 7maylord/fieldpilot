export type ScheduleWindow = {
  startsAt: Date;
  endsAt: Date;
  latitude?: number;
  longitude?: number;
};

export type ScheduleResource = {
  type: 'user' | 'team' | 'equipment';
  skills: string[];
  projectIds?: string[];
  shifts: ScheduleWindow[];
  blackouts: ScheduleWindow[];
  assignments: ScheduleWindow[];
  travelSpeedKph?: number;
};

export type ScheduleCandidate = ScheduleWindow & {
  projectId: string;
  requiredSkills: string[];
  prerequisiteStatuses: string[];
};

export type ScheduleConflict = {
  code: string;
  severity: 'error' | 'warning';
};

export function findScheduleConflicts(
  candidate: ScheduleCandidate,
  resource: ScheduleResource,
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  if (candidate.endsAt <= candidate.startsAt)
    conflicts.push({ code: 'invalid_window', severity: 'error' });
  if (candidate.prerequisiteStatuses.some((status) => status !== 'completed'))
    conflicts.push({ code: 'dependency_incomplete', severity: 'error' });
  if (resource.projectIds && !resource.projectIds.includes(candidate.projectId))
    conflicts.push({ code: 'project_access_missing', severity: 'error' });
  if (
    candidate.requiredSkills.some((skill) => !resource.skills.includes(skill))
  )
    conflicts.push({ code: 'required_skill_missing', severity: 'error' });
  if (
    !resource.shifts.some(
      (shift) =>
        shift.startsAt <= candidate.startsAt &&
        shift.endsAt >= candidate.endsAt,
    )
  )
    conflicts.push({ code: 'outside_shift', severity: 'error' });
  if (resource.blackouts.some((window) => overlaps(candidate, window)))
    conflicts.push({ code: 'resource_blackout', severity: 'error' });
  if (resource.assignments.some((window) => overlaps(candidate, window)))
    conflicts.push({
      code: `${resource.type}_overlap`,
      severity: 'warning',
    });
  if (!travelIsFeasible(candidate, resource))
    conflicts.push({ code: 'travel_infeasible', severity: 'warning' });
  return conflicts;
}

function overlaps(left: ScheduleWindow, right: ScheduleWindow) {
  return left.startsAt < right.endsAt && left.endsAt > right.startsAt;
}

function travelIsFeasible(
  candidate: ScheduleCandidate,
  resource: ScheduleResource,
) {
  if (candidate.latitude === undefined || candidate.longitude === undefined)
    return true;
  const adjacent = resource.assignments.filter(
    (assignment) =>
      assignment.latitude !== undefined && assignment.longitude !== undefined,
  );
  const previous = adjacent
    .filter(({ endsAt }) => endsAt <= candidate.startsAt)
    .sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime())[0];
  const next = adjacent
    .filter(({ startsAt }) => startsAt >= candidate.endsAt)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];
  const speed = resource.travelSpeedKph ?? 40;
  return [
    previous && {
      from: previous,
      to: candidate,
      availableMs: candidate.startsAt.getTime() - previous.endsAt.getTime(),
    },
    next && {
      from: candidate,
      to: next,
      availableMs: next.startsAt.getTime() - candidate.endsAt.getTime(),
    },
  ].every(
    (leg) =>
      !leg || travelMilliseconds(leg.from, leg.to, speed) <= leg.availableMs,
  );
}

function travelMilliseconds(
  from: ScheduleWindow,
  to: ScheduleWindow,
  speedKph: number,
) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(to.latitude! - from.latitude!);
  const longitudeDelta = radians(to.longitude! - from.longitude!);
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(from.latitude!)) *
      Math.cos(radians(to.latitude!)) *
      Math.sin(longitudeDelta / 2) ** 2;
  const kilometers =
    6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
  return (kilometers / speedKph) * 3_600_000;
}
