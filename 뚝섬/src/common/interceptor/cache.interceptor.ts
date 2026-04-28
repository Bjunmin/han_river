import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from "@nestjs/common";
import { RedisService } from 'nestjs-redis';
import { Observable, of, tap } from "rxjs";
import { Cache, CACHE_MANAGER } from "@nestjs/cache-manager";

@Injectable()
export class CacheInterceptor implements NestInterceptor {
    constructor(
        @Inject(CACHE_MANAGER)
        private readonly cacheManager: Cache
    ) { }
    private cache = new Map<string, any>();

    async intercept(context: ExecutionContext, next: CallHandler<any>): Promise<Observable<any>> {
        const request = context.switchToHttp().getRequest();

        /// GET /movie
        const key = `${request.method}-${request.path}`;

        // const measurement = await this.cacheManager.get(serialNumber)
        // if (this.cache.has(key)) {
        //     return of(this.cache.get(key));
        // }

        return next.handle()
            .pipe(
                tap(response => this.cache.set(key, response)),
            )
    }
}