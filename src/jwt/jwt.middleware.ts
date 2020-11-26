import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { UserService } from 'src/users/users.service';
import { JwtService } from './jwt.service';

// class middleware
// user Repository (DB) 사용을 위함
@Injectable()
export class JwtMiddleware implements NestMiddleware {
  constructor(
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
  ) {} // @Injectable 일때만 이런식으로 service 호출가능
  async use(req: Request, res: Response, next: NextFunction) {
    if ('x-jwt' in req.headers) {
      const token = req.headers['x-jwt'];
      try {
        const decoded = this.jwtService.verify(token.toString());
        if (typeof decoded === 'object' && decoded.hasOwnProperty('id')) {
          const user = await this.userService.findById(decoded['id']);
          req['user'] = user;
        }
      } catch (error) {
        console.error(error);
      }
    }
    next();
  }
}

// functional middleware
// export function jwtMiddleware (req: Request, res: Response, next: NextFunction) {
//   console.log(req.headers);
//   next();
// }
