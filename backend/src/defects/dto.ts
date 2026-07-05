import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';
import { defectStatuses, type DefectStatus } from './defect-state';

export class CreateDefectDto {
  @ApiProperty() @IsUUID() projectId!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() locationId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() inspectionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() workOrderId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() assetId?: string;
  @ApiProperty() @IsString() @Length(1, 100) category!: string;
  @ApiProperty({ enum: ['low', 'medium', 'high', 'critical'] })
  @IsIn(['low', 'medium', 'high', 'critical'])
  severity!: string;
  @ApiProperty() @IsString() @Length(1, 200) title!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 4000)
  description?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueAt?: string;
}
export class AssignDefectDto {
  @ApiProperty() @IsInt() @Min(1) version!: number;
  @ApiProperty({ enum: ['user', 'team', 'external'] })
  @IsIn(['user', 'team', 'external'])
  assigneeType!: string;
  @ApiProperty() @IsUUID() assigneeId!: string;
}
export class TransitionDefectDto {
  @ApiProperty() @IsInt() @Min(1) version!: number;
  @ApiProperty({ enum: defectStatuses })
  @IsIn(defectStatuses)
  status!: DefectStatus;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 2000)
  comment?: string;
}
export class SubmitCorrectionDto {
  @ApiProperty() @IsInt() @Min(1) version!: number;
  @ApiProperty() @IsString() @Length(1, 4000) rootCause!: string;
  @ApiProperty() @IsString() @Length(1, 4000) correctiveAction!: string;
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  evidenceIds!: string[];
}
export class VerifyCorrectionDto {
  @ApiProperty() @IsInt() @Min(1) version!: number;
  @ApiProperty() @IsUUID() correctionId!: string;
  @ApiProperty({ enum: ['verified', 'rejected'] })
  @IsIn(['verified', 'rejected'])
  decision!: 'verified' | 'rejected';
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 2000)
  comment?: string;
}
