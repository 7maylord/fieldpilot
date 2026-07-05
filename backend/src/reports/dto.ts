import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

export class CreateDailyReportDto {
  @ApiProperty() @IsUUID() projectId!: string;
  @ApiProperty() @IsDateString() reportDate!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 4000)
  weatherNotes?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 4000)
  supervisorNotes?: string;
}
export class CreateReportRevisionDto {
  @ApiProperty({ type: Object }) @IsObject() content!: Record<string, unknown>;
}
export class ReviewReportDto {
  @ApiProperty({ enum: ['approved', 'rejected'] })
  @IsIn(['approved', 'rejected'])
  decision!: 'approved' | 'rejected';
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 2000)
  comment?: string;
}
export class SignReportDto {
  @ApiProperty() @IsUUID() mediaId!: string;
}
