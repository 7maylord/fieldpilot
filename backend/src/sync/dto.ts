import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class SyncBootstrapDto {
  @ApiProperty() @IsUUID() deviceId!: string;
  @ApiProperty() @IsUUID() organizationId!: string;
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  projectIds!: string[];
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  lastCheckpoint?: string | null;
}

export class SyncOperationDto {
  @ApiProperty() @IsUUID() operationId!: string;
  @ApiProperty() @IsString() entityType!: string;
  @ApiProperty() @IsUUID() entityId!: string;
  @ApiProperty() @IsString() operationType!: string;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  baseVersion?: number | null;
  @ApiProperty() @IsDateString() clientCreatedAt!: string;
  @ApiProperty({ type: Object }) @IsObject() payload!: Record<string, unknown>;
}

export class SyncPushDto {
  @ApiProperty() @IsUUID() organizationId!: string;
  @ApiProperty() @IsUUID() deviceId!: string;
  @ApiProperty({ type: [SyncOperationDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SyncOperationDto)
  operations!: SyncOperationDto[];
}

export class SyncPullDto {
  @ApiProperty() @IsUUID() organizationId!: string;
  @ApiProperty() @IsUUID() deviceId!: string;
  @ApiProperty() @IsUUID() checkpoint!: string;
  @ApiPropertyOptional({ default: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit = 500;
}

export class ResolveConflictDto {
  @ApiProperty() @IsUUID() organizationId!: string;
  @ApiProperty({ type: Object }) @IsObject() resolution!: Record<
    string,
    unknown
  >;
}
