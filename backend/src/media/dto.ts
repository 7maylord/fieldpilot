import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateUploadSessionDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() mediaId?: string;
  @ApiProperty() @IsUUID() projectId!: string;
  @ApiProperty({
    enum: ['image/jpeg', 'image/png', 'application/pdf', 'video/mp4'],
  })
  @IsIn(['image/jpeg', 'image/png', 'application/pdf', 'video/mp4'])
  mimeType!: string;
  @ApiProperty() @IsInt() @Min(1) @Max(104_857_600) byteSize!: number;
  @ApiProperty() @Matches(/^[a-f0-9]{64}$/) sha256!: string;
  @ApiProperty() @IsString() entityType!: string;
  @ApiProperty() @IsUUID() entityId!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() sourceMediaId?: string;
  @ApiPropertyOptional({ enum: ['thumbnail', 'compressed'] })
  @IsOptional()
  @IsIn(['thumbnail', 'compressed'])
  derivativeType?: string;
}

class UploadedPartDto {
  @ApiProperty() @IsInt() @Min(1) partNumber!: number;
  @ApiProperty() @IsString() etag!: string;
}

export class CompleteUploadDto {
  @ApiProperty({ type: [UploadedPartDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => UploadedPartDto)
  parts!: UploadedPartDto[];
}
