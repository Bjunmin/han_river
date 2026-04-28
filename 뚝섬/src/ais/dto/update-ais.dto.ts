import { PartialType } from '@nestjs/mapped-types';
import { CreateAISDto } from './create-ais.dto';

export class UpdateAISDto extends PartialType(CreateAISDto) { }
