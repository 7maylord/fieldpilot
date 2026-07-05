import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';

export class CreateAssetTypeDto {
  @ApiProperty() @IsString() @Length(1, 100) name!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 1000)
  description?: string;
}
export class CreateAssetDto {
  @ApiProperty() @IsUUID() projectId!: string;
  @ApiProperty() @IsUUID() assetTypeId!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() locationId?: string;
  @ApiProperty() @IsString() @Length(1, 200) name!: string;
  @ApiProperty() @IsString() @Length(1, 200) qrCode!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  serialNumber?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  model?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  manufacturer?: string;
  @ApiPropertyOptional({
    enum: ['active', 'inactive', 'maintenance', 'retired'],
  })
  @IsOptional()
  @IsIn(['active', 'inactive', 'maintenance', 'retired'])
  status?: string;
}
export class CreateMeterReadingDto {
  @ApiProperty() @IsString() @Length(1, 100) meterType!: string;
  @ApiProperty() @IsNumber() @Min(0) value!: number;
  @ApiProperty() @IsString() @Length(1, 40) unit!: string;
  @ApiProperty() @IsDateString() recordedAt!: string;
}
