import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';

export class CreateInspectionDto {
  @ApiProperty() @IsUUID() projectId!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() workOrderId?: string;
  @ApiProperty() @IsUUID() formVersionId!: string;
  @ApiProperty({
    enum: [
      'quality',
      'safety',
      'asset',
      'pre_work',
      'completion',
      'reinspection',
      'hold_point',
      'witness_point',
    ],
  })
  @IsIn([
    'quality',
    'safety',
    'asset',
    'pre_work',
    'completion',
    'reinspection',
    'hold_point',
    'witness_point',
  ])
  inspectionType!: string;
}

export class SaveInspectionDraftDto {
  @ApiProperty() @IsInt() @Min(1) version!: number;
  @ApiProperty({ type: Object }) @IsObject() answers!: Record<string, unknown>;
}

export class SubmitInspectionDto extends SaveInspectionDraftDto {
  @ApiProperty({
    enum: [
      'passed',
      'passed_with_observations',
      'failed',
      'incomplete',
      'not_applicable',
    ],
  })
  @IsIn([
    'passed',
    'passed_with_observations',
    'failed',
    'incomplete',
    'not_applicable',
  ])
  outcome!: string;
}

export class ReviewInspectionDto {
  @ApiProperty({ enum: ['approve', 'reject', 'clarification'] })
  @IsIn(['approve', 'reject', 'clarification'])
  decision!: 'approve' | 'reject' | 'clarification';
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 2000)
  comment?: string;
}
