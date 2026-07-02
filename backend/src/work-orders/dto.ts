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
} from 'class-validator';
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
  @ApiProperty({ enum: ['user', 'team'] })
  @IsIn(['user', 'team'])
  assigneeType!: 'user' | 'team';
  @ApiProperty() @IsUUID() assigneeId!: string;
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
