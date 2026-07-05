import { describe, expect, it } from 'vitest';
import { findScheduleConflicts } from './scheduling-conflicts';

const at = (hour: number) =>
  new Date(`2026-07-06T${String(hour).padStart(2, '0')}:00:00Z`);

describe('scheduling conflicts', () => {
  it('reports access, skill, shift, dependency, blackout, overlap, and travel conflicts', () => {
    const conflicts = findScheduleConflicts(
      {
        startsAt: at(10),
        endsAt: at(11),
        latitude: 6.5,
        longitude: 3.4,
        projectId: crypto.randomUUID(),
        requiredSkills: ['welder'],
        prerequisiteStatuses: ['scheduled'],
      },
      {
        type: 'equipment',
        skills: [],
        projectIds: [],
        shifts: [{ startsAt: at(12), endsAt: at(18) }],
        blackouts: [{ startsAt: at(10), endsAt: at(12) }],
        assignments: [
          {
            startsAt: at(9),
            endsAt: at(10),
            latitude: 6.5,
            longitude: 2.4,
          },
          { startsAt: at(10), endsAt: at(12) },
        ],
        travelSpeedKph: 40,
      },
    );

    expect(conflicts.map(({ code }) => code)).toEqual([
      'dependency_incomplete',
      'project_access_missing',
      'required_skill_missing',
      'outside_shift',
      'resource_blackout',
      'equipment_overlap',
      'travel_infeasible',
    ]);
  });

  it('allows adjacent work inside a shift with enough travel time', () => {
    expect(
      findScheduleConflicts(
        {
          startsAt: at(10),
          endsAt: at(11),
          latitude: 6.5,
          longitude: 3.4,
          projectId: 'project',
          requiredSkills: ['inspection'],
          prerequisiteStatuses: ['completed'],
        },
        {
          type: 'user',
          skills: ['inspection'],
          shifts: [{ startsAt: at(8), endsAt: at(17) }],
          blackouts: [],
          assignments: [
            {
              startsAt: at(8),
              endsAt: at(9),
              latitude: 6.5,
              longitude: 3.39,
            },
          ],
        },
      ),
    ).toEqual([]);
  });
});
