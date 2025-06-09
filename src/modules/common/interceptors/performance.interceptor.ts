import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { performance } from 'perf_hooks';

@Injectable()
export class PerformanceInterceptor implements NestInterceptor {
  private readonly logger = new Logger(PerformanceInterceptor.name);
  private readonly slowRequestThreshold = 1000; // 1 секунда

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const method = req.method;
    const url = req.url;
    const start = performance.now();

    return next.handle().pipe(
      tap(() => {
        const duration = performance.now() - start;

        // Логируем медленные запросы
        if (duration > this.slowRequestThreshold) {
          this.logger.warn(`Slow request detected: ${method} ${url} took ${duration.toFixed(2)}ms`);
        }

        // В режиме разработки логируем все запросы
        if (process.env.NODE_ENV !== 'production') {
          this.logger.debug(`${method} ${url} - ${duration.toFixed(2)}ms`);
        }
      }),
      catchError(error => {
        const duration = performance.now() - start;
        this.logger.error(
          `Request failed: ${method} ${url} - ${duration.toFixed(2)}ms`,
          error.stack,
        );
        throw error;
      }),
    );
  }
}
