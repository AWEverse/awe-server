import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Query,
  ParseIntPipe,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { CryptoService } from './crypto.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  CreateKeysDto,
  UploadPreKeysDto,
  GetKeyBundleDto,
  RotateSignedPreKeyDto,
} from './dto/crypto.dto';
import { GetUser } from '../../common/decorators/get-user.decorator';

@Controller('crypto')
@UseGuards(JwtAuthGuard)
export class CryptoController {
  constructor(private readonly cryptoService: CryptoService) {}

  @Post('keys/identity')
  async createIdentityKey(@GetUser('id') userId: bigint, @Body() createKeysDto: CreateKeysDto) {
    return this.cryptoService.createIdentityKey(userId, createKeysDto);
  }

  @Get('keys/identity/:userId')
  async getIdentityKey(@Param('userId') userId: string) {
    const userIdBigInt = BigInt(userId);
    return this.cryptoService.getIdentityKey(userIdBigInt);
  }

  @Post('keys/prekeys/signed')
  async uploadSignedPreKey(@GetUser('id') userId: bigint, @Body() uploadDto: UploadPreKeysDto) {
    return this.cryptoService.uploadSignedPreKey(userId, uploadDto);
  }

  @Put('keys/prekeys/signed/rotate')
  async rotateSignedPreKey(
    @GetUser('id') userId: bigint,
    @Body() rotateDto: RotateSignedPreKeyDto,
  ) {
    return this.cryptoService.rotateSignedPreKey(userId, rotateDto);
  }

  @Post('keys/prekeys/onetime')
  async uploadOneTimePreKeys(@GetUser('id') userId: bigint, @Body() uploadDto: UploadPreKeysDto) {
    return this.cryptoService.uploadOneTimePreKeys(userId, uploadDto);
  }

  @Get('keys/prekeys/onetime/count')
  async getOneTimePreKeyCount(@GetUser('id') userId: bigint) {
    return this.cryptoService.getOneTimePreKeyCount(userId);
  }

  @Get('keys/bundle/:userId')
  async getKeyBundle(@Param('userId') userId: string, @Query() query: GetKeyBundleDto) {
    const userIdBigInt = BigInt(userId);
    return this.cryptoService.getKeyBundle(userIdBigInt, query);
  }

  @Delete('keys/prekeys/onetime/:keyId')
  async markOneTimePreKeyAsUsed(
    @GetUser('id') userId: bigint,
    @Param('keyId', ParseIntPipe) keyId: number,
  ) {
    return this.cryptoService.markOneTimePreKeyAsUsed(userId, keyId);
  }

  @Get('keys/prekeys/signed/current')
  async getCurrentSignedPreKey(@GetUser('id') userId: bigint) {
    return this.cryptoService.getCurrentSignedPreKey(userId);
  }

  @Delete('keys/prekeys/signed/cleanup')
  async cleanupExpiredSignedPreKeys(@GetUser('id') userId: bigint) {
    return this.cryptoService.cleanupExpiredSignedPreKeys(userId);
  }

  @Get('keys/status')
  async getKeyStatus(@GetUser('id') userId: bigint) {
    return this.cryptoService.getKeyStatus(userId);
  }
}
