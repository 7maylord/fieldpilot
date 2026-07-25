import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { Capability } from '../authorization/capability';
import { RequiresCapability } from '../authorization/capability.guard';
import {
  AcceptInvitationDto,
  AddTeamMemberDto,
  CreateOrganizationDto,
  CreateTeamDto,
  GrantProjectAccessDto,
  InviteMemberDto,
  UpdateMembershipDto,
} from './dto';
import { OrganizationsService } from './organizations.service';

@ApiTags('organizations')
@Controller()
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get('organizations')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.organizations.list(user.id);
  }

  @Post('organizations')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateOrganizationDto,
  ) {
    return this.organizations.create(user.id, body.name, body.slug);
  }

  @Post('invitations/accept')
  accept(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: AcceptInvitationDto,
  ) {
    return this.organizations.acceptInvitation(user.id, user.email, body.token);
  }

  @Get('organizations/:organizationId/members')
  @RequiresCapability(Capability.OrganizationManage)
  members(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ) {
    return this.organizations.listMembers(organizationId, user.id);
  }

  @Get('organizations/:organizationId/audit')
  @RequiresCapability(Capability.AuditView)
  audit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ) {
    return this.organizations.listAudit(organizationId, user.id);
  }

  @Get('organizations/:organizationId/teams')
  @RequiresCapability(Capability.TeamsManage)
  teams(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ) {
    return this.organizations.listTeams(organizationId, user.id);
  }

  @Post('organizations/:organizationId/invitations')
  @RequiresCapability(Capability.MembersInvite)
  invite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() body: InviteMemberDto,
  ) {
    return this.organizations.invite(
      organizationId,
      user.id,
      body.email,
      body.role,
    );
  }

  @Patch('organizations/:organizationId/members/:membershipId')
  @RequiresCapability(Capability.OrganizationManage)
  updateMembership(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() body: UpdateMembershipDto,
  ) {
    return this.organizations.updateMembership(
      organizationId,
      user.id,
      membershipId,
      body.role,
      body.isExternal,
    );
  }

  @Post('organizations/:organizationId/teams')
  @RequiresCapability(Capability.TeamsManage)
  createTeam(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() body: CreateTeamDto,
  ) {
    return this.organizations.createTeam(organizationId, user.id, body.name);
  }

  @Post('organizations/:organizationId/teams/:teamId/members')
  @RequiresCapability(Capability.TeamsManage)
  addTeamMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Body() body: AddTeamMemberDto,
  ) {
    return this.organizations.addTeamMember(
      organizationId,
      user.id,
      teamId,
      body.userId,
    );
  }

  @Post('organizations/:organizationId/project-access')
  @RequiresCapability(Capability.ProjectsManage)
  grantProjectAccess(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() body: GrantProjectAccessDto,
  ) {
    return this.organizations.grantProjectAccess(
      organizationId,
      user.id,
      body.projectId,
      body.userId,
    );
  }
}
