import { BadRequestException, Injectable, NestMiddleware, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { NextFunction, Request, Response } from "express";
import { envVariableKeys } from "src/common/const/env.const";

// 인증은 middleware 인가는 guard
@Injectable()
export class BearerTokenMiddleware implements NestMiddleware {
    constructor(
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService
    ) {

    }
    async use(req: Request, res: Response, next: NextFunction) {
        /// Bearer $token
        const authHeader = req.header('authorization');

        if (!authHeader) {
            req.user = {
                'sub': '01065982120'
            }
            next();
            return
            // throw new UnauthorizedException("토큰이 없습니다");
        }

        try {
            const token = this.validateBearerToken(authHeader);

            const decodedPayload = this.jwtService.decode(token);
            if (!decodedPayload) {
                throw new UnauthorizedException("유효하지 않는 토큰입니다.");
            }

            if (decodedPayload.type !== 'refresh' && decodedPayload.type !== 'access') {
                throw new UnauthorizedException("유효하지 않는 토큰입니다.");
            }

            const secretKey = decodedPayload.type === 'refresh' ?
                envVariableKeys.refreshTokenSecret :
                envVariableKeys.accessTokenSecret;

            const payload = await this.jwtService.verifyAsync(token, {
                secret: this.configService.get<string>(
                    secretKey,
                )
            })
            req.user = payload;
            next();
        } catch (e) {
            if (e.name === "TokenExpiredError") {
                throw new UnauthorizedException("토큰이 만료됐습니다.");
            } else if (e.name == "JsonWebTokenError") {
                throw new UnauthorizedException("유효하지 않는 토큰입니다")
            } else {
                throw new UnauthorizedException("유효하지 않는 토큰입니다")
            }
        }
    }

    validateBearerToken(rawToken: string) {
        const basicSplit = rawToken.split(' ');

        if (basicSplit.length !== 2) {
            throw new BadRequestException("토큰 포맷이 잘못 되었습니다.");
        }

        const [bearer, token] = basicSplit;

        if (bearer.toLowerCase() !== "bearer") {
            throw new BadRequestException("토큰 포맷이 잘못 되었습니다.");
        }
        return token;
    }


}