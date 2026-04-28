import { BadRequestException, Injectable, InternalServerErrorException } from "@nestjs/common";
import { SelectQueryBuilder } from "typeorm";
import { v4 as Uuid } from 'uuid';
import { ConfigService } from "@nestjs/config";
import { envVariableKeys } from "./const/env.const";
import { PagePaginationDto } from "./dto/page-pagination.dto";
import * as nodemailer from 'nodemailer';
import { CursorPaginationDto } from "./dto/cursor-pagination.dto";

@Injectable()
export class CommonService {

    private transporter;
    constructor(
        private readonly configService: ConfigService,
    ) {
        this.transporter = nodemailer.createTransport({
            // SMTP 설정
            host: 'smtp.gmail.com', //smtp 호스트
            port: 587,
            secure: false,
            auth: {
                user: configService.get<string>(envVariableKeys.smtp_account),
                pass: configService.get<string>(envVariableKeys.smtp_password),
            }
        })
    }


    applyPagePaginationParamsToQb<T>(qb: SelectQueryBuilder<T>, dto: PagePaginationDto) {
        const { page, take } = dto;

        const skip = (page - 1) * take;

        qb.take(take);
        qb.skip(skip);
    }

    applyCursorPaginationParamsToQb<T>(qb: SelectQueryBuilder<T>, dto: CursorPaginationDto) {
        const { cursorId, take } = dto;
        console.log(cursorId, take)


        if (cursorId) {
            qb.andWhere(`${qb.alias}.id < :cursorId`, { cursorId })
        }
        qb.take(take);
    }

    async sendPasswordResetMail(to: string, link: string) {
        await this.transporter.sendMail({
            to,
            subject: '비밀번호 재설정',
            html: `<p>비밀번호를 재설정하려면 아래 링크를 클릭하세요:</p>
                 <a href="${link}">${link}</a>`,
        });
    }
}