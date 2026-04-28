import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";


export class CreateUserSettingDto {
    @IsNotEmpty()
    @IsString()
    nickname: string

    @IsNotEmpty()
    @IsNumber()
    userId: number
}
