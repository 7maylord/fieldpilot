import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'worker@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 12 })
  @IsString()
  @MinLength(12)
  password!: string;
}

export class LoginDto extends RegisterDto {}

export class TokenDto {
  @ApiProperty()
  @IsString()
  token!: string;
}

export class RequestPasswordResetDto {
  @ApiProperty()
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto extends TokenDto {
  @ApiProperty({ minLength: 12 })
  @IsString()
  @MinLength(12)
  password!: string;
}
