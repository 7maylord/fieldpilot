import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiProperty({ example: 'chinedu.okafor@example.test' })
  @IsEmail()
  email!: string;

  @ApiProperty({ enum: roles })
  @IsIn(roles)
  role!: string;
}

export class AcceptInvitationDto {
  @ApiProperty()
  @IsString()
  token!: string;
}

export class UpdateMembershipDto {
  @ApiProperty({ enum: roles })
  @IsIn(roles)
  role!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isExternal?: boolean;
}

export class CreateTeamDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  name!: string;
}

export class AddTeamMemberDto {
  @ApiProperty()
  @IsUUID()
  userId!: string;
}

export class GrantProjectAccessDto {
  @ApiProperty()
  @IsUUID()
  projectId!: string;

  @ApiProperty()
  @IsUUID()
  userId!: string;
}
