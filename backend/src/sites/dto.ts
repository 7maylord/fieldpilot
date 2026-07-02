import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

const locationTypes = [
  'site',
  'zone',
  'building',
  'floor',
  'room',
  'road_segment',
  'chainage_section',
  'structure',
  'pipeline_segment',
  'asset_location',
  'gps_point',
  'polygon',
] as const;

export class CreateSiteDto {
  @ApiProperty() @IsString() @Length(1, 160) name!: string;
  @ApiProperty() @Matches(/^[A-Z0-9][A-Z0-9-]{1,31}$/) code!: string;
}

export class CreateLocationDto {
  @ApiProperty() @IsString() @Length(1, 160) name!: string;
  @ApiProperty({ enum: locationTypes })
  @IsIn(locationTypes)
  locationType!: (typeof locationTypes)[number];
  @ApiPropertyOptional() @IsOptional() @IsUUID() parentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsLatitude() latitude?: number;
  @ApiPropertyOptional() @IsOptional() @IsLongitude() longitude?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() chainageStart?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() chainageEnd?: number;
}

export class ViewportQueryDto {
  @ApiProperty() @Type(() => Number) @IsLongitude() west!: number;
  @ApiProperty() @Type(() => Number) @IsLatitude() south!: number;
  @ApiProperty() @Type(() => Number) @IsLongitude() east!: number;
  @ApiProperty() @Type(() => Number) @IsLatitude() north!: number;
  @ApiPropertyOptional({ default: 200, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit = 200;
}
