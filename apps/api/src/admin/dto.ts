import { OmitType, PartialType } from '@nestjs/mapped-types';
import { AgeMode, ChallengeType, GameStatus, Role } from '@prisma/client';
import { templates } from '@axia/engine';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_MESSAGE = 'must be lowercase letters, numbers and dashes';

export class CreateGameDto {
  @IsString() @Matches(SLUG, { message: `slug ${SLUG_MESSAGE}` })
  slug: string;

  @IsString() @MinLength(2) @MaxLength(80)
  name: string;

  @IsString() @MaxLength(500)
  description: string;

  @IsString() @IsIn(Object.keys(templates))
  templateKey: string;

  @IsOptional() @IsEnum(GameStatus)
  status?: GameStatus;

  @IsOptional() @IsEnum(AgeMode, { each: true })
  ageModes?: AgeMode[];

  @IsOptional() @IsInt() @Min(1) @Max(120)
  estMinutes?: number;

  @IsOptional() @IsInt() @Min(0) @Max(1000)
  attemptsPerDay?: number;

  /** null clears the availability window. */
  @IsOptional() @IsDateString()
  availableFrom?: string | null;

  @IsOptional() @IsDateString()
  availableTo?: string | null;

  @IsOptional() @IsInt()
  sortOrder?: number;
}

/** The template is fixed once a game exists, because presets are validated against it. */
export class UpdateGameDto extends PartialType(OmitType(CreateGameDto, ['templateKey'] as const)) {}

export class CreatePresetDto {
  @IsString() @Matches(SLUG, { message: `key ${SLUG_MESSAGE}` })
  key: string;

  @IsString() @MinLength(1) @MaxLength(40)
  label: string;

  /** Template params; missing keys fall back to template defaults. */
  @IsOptional() @IsObject()
  params?: Record<string, unknown>;

  @IsOptional() @IsBoolean()
  isDefault?: boolean;

  @IsOptional() @IsInt()
  sortOrder?: number;
}

export class UpdatePresetDto extends PartialType(OmitType(CreatePresetDto, ['key'] as const)) {}

export class PreviewDto {
  @IsOptional() @IsObject()
  params?: Record<string, unknown>;

  @IsOptional() @IsString()
  seed?: string;
}

export class CreateChallengeDto {
  @IsString()
  gameId: string;

  @IsString()
  presetId: string;

  @IsEnum(ChallengeType)
  type: ChallengeType;

  @IsString() @MinLength(2) @MaxLength(120)
  title: string;

  /** Defaults to a random seed. Everyone playing the challenge gets the same level. */
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120)
  seed?: string;

  @IsDateString()
  startsAt: string;

  @IsDateString()
  endsAt: string;
}

export class UpdateChallengeDto extends PartialType(OmitType(CreateChallengeDto, ['gameId'] as const)) {}

export class UpdateUserDto {
  @IsOptional() @IsEnum(Role)
  role?: Role;

  @IsOptional() @IsBoolean()
  banned?: boolean;
}
