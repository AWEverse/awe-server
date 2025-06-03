import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

function convertBigIntToString(input: any): any {
  if (typeof input === 'bigint') {
    return input.toString();
  }

  if (Array.isArray(input)) {
    return input.map(convertBigIntToString);
  }

  if (input && typeof input === 'object') {
    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(input)) {
      result[key] = convertBigIntToString(value);
    }
    return result;
  }

  return input;
}

@Injectable()
export class BigIntInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(map(data => convertBigIntToString(data)));
  }
}
