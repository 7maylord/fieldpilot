import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
} from 'class-validator';

export const projectStatuses = [
  'draft',
  'active',
  'paused',
  'completed',
  'archived',
] as const;

export class CreateProjectDto {
  @ApiProperty() @IsString() @Length(1, 160) name!: string;
  @ApiProperty() @Matches(/^[A-Z0-9][A-Z0-9-]{1,31}$/) code!: string;
  @ApiProperty({ example: 'Africa/Lagos' }) @IsString() timezone!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 2000)
  description?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 160)
  client?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 500)
  address?: string;
}

export class UpdateProjectDto {
  @ApiProperty() @IsInt() @Min(1) version!: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 160)
  name?: string;
  @ApiPropertyOptional({ enum: projectStatuses })
  @IsOptional()
  @IsIn(projectStatuses)
  status?: (typeof projectStatuses)[number];
  @ApiPropertyOptional() @IsOptional() @IsString() timezone?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 2000)
  description?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 160)
  client?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 500)
  address?: string;
}

export class ArchiveProjectDto {
  @ApiProperty() @IsInt() @Min(1) version!: number;
}
