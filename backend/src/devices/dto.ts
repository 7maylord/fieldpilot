import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, IsUUID, Length, Matches } from 'class-validator';

export class RegisterDeviceDto {
  @ApiProperty() @IsUUID() deviceId!: string;
  @ApiProperty() @IsString() @Length(1, 120) name!: string;
  @ApiProperty({ enum: ['web', 'ios', 'android'] })
  @IsIn(['web', 'ios', 'android'])
  platform!: string;
  @ApiProperty({ example: '1.2.3' })
  @Matches(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/)
  appVersion!: string;
}

export class UpdateDeviceVersionDto {
  @ApiProperty({ example: '1.2.3' })
  @Matches(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/)
  appVersion!: string;
}
