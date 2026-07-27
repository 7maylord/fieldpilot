'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { apiRequest } from '../lib/api';

type Organization = { id: string; name: string; slug: string };
type Member = {
  id: string;
  userId: string;
  role: string;
  status: string;
  isExternal: boolean;
  user?: { email: string };
};
type Team = {
  id: string;
  name: string;
  members?: Array<{ id: string; userId: string; user?: { email: string } }>;
};
type Project = { id: string; name: string; code: string };

const roles = [
  'owner',
  'admin',
  'manager',
  'coordinator',
  'member',
  'viewer',
  'external',
] as const;

const inviteSchema = z.object({
  email: z.email('Enter a valid email address'),
  role: z.enum(roles),
});
const roleSchema = z.object({
  membershipId: z.string().min(1, 'Choose a member'),
  role: z.enum(roles),
});
const teamSchema = z.object({ name: z.string().min(2, 'Name is required') });
const teamMemberSchema = z.object({
  teamId: z.string().min(1, 'Choose a team'),
  userId: z.string().min(1, 'Choose a member'),
});
const accessSchema = z.object({
  projectId: z.string().min(1, 'Choose a project'),
  userId: z.string().min(1, 'Choose a member'),
});

export function MembersScreen({
  organizationSlug,
}: {
  organizationSlug: string;
}) {
  const client = useQueryClient();
  const organizations = useQuery({
    queryKey: ['organizations'],
    queryFn: () => apiRequest<Organization[]>('/organizations'),
  });
  const organization = organizations.data?.find(
    ({ slug }) => slug === organizationSlug,
  );
  const organizationId = organization?.id;
  const members = useQuery({
    queryKey: ['members', organizationId],
    queryFn: () =>
      apiRequest<Member[]>(`/organizations/${organizationId}/members`),
    enabled: Boolean(organizationId),
  });
  const teams = useQuery({
    queryKey: ['teams', organizationId],
    queryFn: () => apiRequest<Team[]>(`/organizations/${organizationId}/teams`),
    enabled: Boolean(organizationId),
  });
  const projects = useQuery({
    queryKey: ['projects', organizationId],
    queryFn: () =>
      apiRequest<Project[]>(`/organizations/${organizationId}/projects`),
    enabled: Boolean(organizationId),
  });
  const activeMembers =
    members.data?.filter((member) => member.status === 'active') ?? [];

  const inviteForm = useForm<z.infer<typeof inviteSchema>>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { role: 'member' },
  });
  const roleForm = useForm<z.infer<typeof roleSchema>>({
    resolver: zodResolver(roleSchema),
    defaultValues: { role: 'member' },
  });
  const teamForm = useForm<z.infer<typeof teamSchema>>({
    resolver: zodResolver(teamSchema),
  });
  const teamMemberForm = useForm<z.infer<typeof teamMemberSchema>>({
    resolver: zodResolver(teamMemberSchema),
  });
  const accessForm = useForm<z.infer<typeof accessSchema>>({
    resolver: zodResolver(accessSchema),
  });

  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['members', organizationId] }),
      client.invalidateQueries({ queryKey: ['teams', organizationId] }),
      client.invalidateQueries({ queryKey: ['projects', organizationId] }),
    ]);
  };
  const invite = useMutation({
    mutationFn: (input: z.infer<typeof inviteSchema>) =>
      apiRequest(`/organizations/${organizationId}/invitations`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      inviteForm.reset({ role: 'member', email: '' });
      await refresh();
      toast.success('Invite queued.');
    },
  });
  const updateRole = useMutation({
    mutationFn: (input: z.infer<typeof roleSchema>) =>
      apiRequest(
        `/organizations/${organizationId}/members/${input.membershipId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ role: input.role }),
        },
      ),
    onSuccess: async () => {
      await refresh();
      toast.success('Role updated.');
    },
  });
  const revokeMember = useMutation({
    mutationFn: (membershipId: string) =>
      apiRequest(
        `/organizations/${organizationId}/members/${membershipId}/revoke`,
        { method: 'POST' },
      ),
    onSuccess: async () => {
      await refresh();
      toast.success('Member access revoked.');
    },
  });
  const createTeam = useMutation({
    mutationFn: (input: z.infer<typeof teamSchema>) =>
      apiRequest(`/organizations/${organizationId}/teams`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      teamForm.reset();
      await refresh();
      toast.success('Team created.');
    },
  });
  const addTeamMember = useMutation({
    mutationFn: (input: z.infer<typeof teamMemberSchema>) =>
      apiRequest(
        `/organizations/${organizationId}/teams/${input.teamId}/members`,
        {
          method: 'POST',
          body: JSON.stringify({ userId: input.userId }),
        },
      ),
    onSuccess: async () => {
      await refresh();
      toast.success('Team membership saved.');
    },
  });
  const grantAccess = useMutation({
    mutationFn: (input: z.infer<typeof accessSchema>) =>
      apiRequest(`/organizations/${organizationId}/project-access`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await refresh();
      toast.success('Project access saved.');
    },
  });

  if (organizations.isLoading) return <p>Loading organization…</p>;
  if (!organization)
    return (
      <div className="empty-state">
        <strong>Organization not found</strong>
        <Link className="primary" href="/organizations">
          Choose organization
        </Link>
      </div>
    );

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Access control</p>
          <h1>Members</h1>
          <p>{organization.name}</p>
        </div>
      </section>
      <div className="projects-grid">
        <section className="panel">
          <h2>Organization members</h2>
          {members.isLoading ? (
            <p>Loading members…</p>
          ) : members.isError ? (
            <p className="field-error" role="alert">
              {members.error.message}
            </p>
          ) : (
            <ul className="project-list">
              {members.data?.map((member) => (
                <li key={member.id}>
                  <div>
                    <strong>{member.user?.email ?? member.userId}</strong>
                    <span>
                      {member.status} ·{' '}
                      {member.isExternal ? 'external' : 'internal'}
                    </span>
                  </div>
                  <div className="member-actions">
                    <span className="status-pill">{member.role}</span>
                    {member.status === 'active' && (
                      <button
                        className="secondary small-button"
                        type="button"
                        disabled={revokeMember.isPending}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Revoke access for ${
                                member.user?.email ?? member.userId
                              }?`,
                            )
                          )
                            revokeMember.mutate(member.id);
                        }}
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {revokeMember.isError && (
            <p className="field-error" role="alert">
              {revokeMember.error.message}
            </p>
          )}
          <form
            className="project-form"
            onSubmit={roleForm.handleSubmit((input) =>
              updateRole.mutate(input),
            )}
          >
            <h2>Change role</h2>
            <label>
              Member
              <select {...roleForm.register('membershipId')}>
                <option value="">Select member</option>
                {activeMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.user?.email ?? member.userId}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Role
              <select {...roleForm.register('role')}>
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="primary"
              type="submit"
              disabled={updateRole.isPending}
            >
              {updateRole.isPending ? 'Updating…' : 'Update role'}
            </button>
            {updateRole.isError && (
              <p className="field-error" role="alert">
                {updateRole.error.message}
              </p>
            )}
          </form>
        </section>
        <section className="panel">
          <h2>Invite member</h2>
          <p>
            Invites go to Mailpit locally. The invited user must sign up with
            the same email before accepting.
          </p>
          <form
            className="project-form"
            onSubmit={inviteForm.handleSubmit((input) => invite.mutate(input))}
            noValidate
          >
            <label>
              Email
              <input
                type="email"
                {...inviteForm.register('email')}
                placeholder="chinedu.okafor@example.test"
              />
              {inviteForm.formState.errors.email && (
                <span className="field-error">
                  {inviteForm.formState.errors.email.message}
                </span>
              )}
            </label>
            <label>
              Role
              <select {...inviteForm.register('role')}>
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="primary"
              type="submit"
              disabled={invite.isPending}
            >
              {invite.isPending ? 'Sending…' : 'Send invite'}
            </button>
            {invite.isSuccess && <p role="status">Invite queued.</p>}
            {invite.isError && (
              <p className="field-error" role="alert">
                {invite.error.message}
              </p>
            )}
          </form>
        </section>
        <section className="panel">
          <h2>Teams</h2>
          <form
            className="project-form"
            onSubmit={teamForm.handleSubmit((input) =>
              createTeam.mutate(input),
            )}
          >
            <label>
              Team name
              <input
                {...teamForm.register('name')}
                placeholder="Island field crew"
              />
            </label>
            <button
              className="primary"
              type="submit"
              disabled={createTeam.isPending}
            >
              {createTeam.isPending ? 'Creating…' : 'Create team'}
            </button>
          </form>
          <ul className="project-list">
            {teams.data?.map((team) => (
              <li key={team.id}>
                <div>
                  <strong>{team.name}</strong>
                  <span>{team.members?.length ?? 0} members</span>
                  {team.members?.map((member) => (
                    <span key={member.id}>
                      {member.user?.email ?? member.userId}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          <form
            className="project-form"
            onSubmit={teamMemberForm.handleSubmit((input) =>
              addTeamMember.mutate(input),
            )}
          >
            <h2>Add member to team</h2>
            <label>
              Team
              <select {...teamMemberForm.register('teamId')}>
                <option value="">Select team</option>
                {teams.data?.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Member
              <select {...teamMemberForm.register('userId')}>
                <option value="">Select member</option>
                {activeMembers.map((member) => (
                  <option key={member.id} value={member.userId}>
                    {member.user?.email ?? member.userId}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="primary"
              type="submit"
              disabled={addTeamMember.isPending}
            >
              {addTeamMember.isPending ? 'Adding…' : 'Add to team'}
            </button>
            {addTeamMember.isSuccess && (
              <p role="status">Team membership saved.</p>
            )}
            {addTeamMember.isError && (
              <p className="field-error" role="alert">
                {addTeamMember.error.message}
              </p>
            )}
          </form>
        </section>
        <section className="panel">
          <h2>Project access</h2>
          <form
            className="project-form"
            onSubmit={accessForm.handleSubmit((input) =>
              grantAccess.mutate(input),
            )}
          >
            <label>
              Project
              <select {...accessForm.register('projectId')}>
                <option value="">Select project</option>
                {projects.data?.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.code} · {project.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Member
              <select {...accessForm.register('userId')}>
                <option value="">Select member</option>
                {activeMembers.map((member) => (
                  <option key={member.id} value={member.userId}>
                    {member.user?.email ?? member.userId}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="primary"
              type="submit"
              disabled={grantAccess.isPending}
            >
              {grantAccess.isPending ? 'Granting…' : 'Grant access'}
            </button>
            {grantAccess.isSuccess && (
              <p role="status">Project access saved.</p>
            )}
            {grantAccess.isError && (
              <p className="field-error" role="alert">
                {grantAccess.error.message}
              </p>
            )}
          </form>
        </section>
      </div>
    </>
  );
}
