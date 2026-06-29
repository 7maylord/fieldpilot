import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MinLength,
} from 'class-validator';

export const roles = [
  'owner',
  'admin',
  'manager',
  'coordinator',
  'member',
  'viewer',
  'external',
] as const;

export class CreateOrganizationDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ example: 'north-site' })
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;
}

export class InviteMemberDto {
  @IsEmail()
  email!: string;

  @IsIn(roles)
  role!: string;
}

export class AcceptInvitationDto {
  @IsString()
  token!: string;
}

export class UpdateMembershipDto {
  @IsIn(roles)
  role!: string;

  @IsOptional()
  @IsBoolean()
  isExternal?: boolean;
}

export class CreateTeamDto {
  @IsString()
  @MinLength(2)
  name!: string;
}

export class AddTeamMemberDto {
  @IsUUID()
  userId!: string;
}

export class GrantProjectAccessDto {
  @IsUUID()
  projectId!: string;

  @IsUUID()
  userId!: string;
}
