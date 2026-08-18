import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class UpdateTeacherDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  email?: string;

  @IsOptional()
  @IsString()
  bio?: string | null;

  @IsOptional()
  @IsUUID(4, { each: true })
  subjectIds?: string[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
