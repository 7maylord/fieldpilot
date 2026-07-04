import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, Length } from 'class-validator';

export class CreateFormTemplateDto {
  @ApiProperty() @IsString() @Length(1, 160) name!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 1000)
  description?: string;
  @ApiProperty({ type: Object }) @IsObject() schema!: Record<string, unknown>;
}

export class UpdateFormDraftDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 160)
  name?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 1000)
  description?: string;
  @ApiProperty({ type: Object }) @IsObject() schema!: Record<string, unknown>;
}

export class DuplicateFormTemplateDto {
  @ApiProperty() @IsString() @Length(1, 160) name!: string;
}
