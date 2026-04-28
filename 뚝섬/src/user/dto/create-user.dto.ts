import { IsBoolean, IsNotEmpty, IsOptional, IsString } from "class-validator";


export class CreateUserDto {
    @IsNotEmpty()
    @IsString()
    name: string

    @IsNotEmpty()
    @IsString()
    password: string

    @IsNotEmpty()
    @IsString()
    phoneNumber: string

    @IsOptional()
    @IsBoolean()
    agree: boolean

}
