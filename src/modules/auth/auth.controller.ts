import { Controller, Post, Body, Get, UseGuards, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SupabaseAuthGuard } from './guards/supabase-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() body: { email: string; password: string; username: string }) {
    return this.authService.register(body.email, body.password, body.username);
  }

  @Post('login')
  async login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password);
  }

  @Post('refresh')
  @UseGuards(SupabaseAuthGuard)
  async refresh(@Request() req: any) {
    return this.authService.refresh(req.user?.access_token);
  }

  @Post('logout')
  @UseGuards(SupabaseAuthGuard)
  async logout(@Request() req: any) {
    return this.authService.logout(req.user?.access_token);
  }

  @Get('profile')
  @UseGuards(SupabaseAuthGuard)
  async getProfile(@Request() req: any) {
    return this.authService.getUserProfile(req.user?.access_token);
  }
}
