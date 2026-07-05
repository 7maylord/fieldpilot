import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { workOrderStatuses, type WorkOrderStatus } from './work-order-state';

export class CreateWorkOrderDto {
  @ApiProperty() @IsUUID() projectId!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() siteId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() locationId?: string;
  @ApiProperty() @IsString() @Length(1, 200) title!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 4000)
  description?: string;
  @ApiProperty() @IsString() @Length(1, 80) workType!: string;
  @ApiProperty({ enum: ['low', 'medium', 'high', 'critical'] })
  @IsIn(['low', 'medium', 'high', 'critical'])
  priority!: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() plannedStart?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() plannedEnd?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueAt?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(525600)
  estimatedMinutes?: number;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredSkills: string[] = [];
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  evidenceRequirements: string[] = [];
  @ApiPropertyOptional() @IsOptional() @IsObject() completionRules: Record<
    string,
    unknown
  > = {};
  @ApiPropertyOptional() @IsOptional() @IsUUID() checklistId?: string;
}

export class AssignWorkOrderDto {
  @ApiProperty() @IsInt() @Min(1) version!: number;
  @ApiProperty({ enum: ['user', 'team', 'equipment'] })
  @IsIn(['user', 'team', 'equipment'])
  assigneeType!: 'user' | 'team' | 'equipment';
  @ApiProperty() @IsUUID() assigneeId!: string;
}

export class CheckScheduleDto {
  @ApiProperty({ enum: ['user', 'team', 'equipment'] })
  @IsIn(['user', 'team', 'equipment'])
  assigneeType!: 'user' | 'team' | 'equipment';
  @ApiProperty() @IsUUID() assigneeId!: string;
}

class ScheduleWindowDto {
  @ApiProperty() @IsDateString() startsAt!: string;
  @ApiProperty() @IsDateString() endsAt!: string;
}

export class UpsertScheduleResourceDto {
  @ApiProperty({ enum: ['user', 'team', 'equipment'] })
  @IsIn(['user', 'team', 'equipment'])
  resourceType!: 'user' | 'team' | 'equipment';
  @ApiProperty() @IsUUID() resourceId!: string;
  @ApiProperty() @IsString() @Length(1, 200) name!: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills: string[] = [];
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  projectIds: string[] = [];
  @ApiPropertyOptional({ type: [ScheduleWindowDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleWindowDto)
  shifts: ScheduleWindowDto[] = [];
  @ApiPropertyOptional({ type: [ScheduleWindowDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleWindowDto)
  blackouts: ScheduleWindowDto[] = [];
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  travelSpeedKph = 40;
}

export class AddDependencyDto {
  @ApiProperty() @IsInt() @Min(1) version!: number;
  @ApiProperty() @IsUUID() prerequisiteWorkOrderId!: string;
}

export class TransitionWorkOrderDto {
  @ApiProperty() @IsInt() @Min(1) version!: number;
  @ApiProperty({ enum: workOrderStatuses })
  @IsIn(workOrderStatuses)
  status!: WorkOrderStatus;
}
