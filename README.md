# AWE Platform - Server

<p align="center">
  <img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" />
</p>

<p align="center">
  Advanced Web Experience Platform - A comprehensive, production-ready server built with NestJS
</p>

<p align="center">
  <a href="https://nestjs.com/" target="_blank">
    <img src="https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white" alt="NestJS" />
  </a>
  <a href="https://www.typescriptlang.org/" target="_blank">
    <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  </a>
  <a href="https://www.prisma.io/" target="_blank">
    <img src="https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white" alt="Prisma" />
  </a>
  <a href="https://www.postgresql.org/" target="_blank">
    <img src="https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  </a>
  <a href="https://redis.io/" target="_blank">
    <img src="https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white" alt="Redis" />
  </a>
</p>

## 🚀 Overview

AWE (Advanced Web Experience) is a comprehensive, enterprise-grade platform providing:

- **Real-time Messaging** - WebSocket-based instant messaging with file sharing
- **Forum System** - Full-featured forum with moderation and search
- **Media Management** - Advanced media hosting, processing, and CDN delivery
- **User Management** - Complete user profiles, security, and preferences
- **Authentication** - Secure auth with JWT, social login, and 2FA
- **File Uploads** - Scalable file upload with Cloudflare R2 integration

## 📁 Architecture

```
src/
├── modules/                    # Feature modules
│   ├── auth/                  # Authentication & authorization
│   ├── users/                 # User management & profiles
│   ├── messanger/             # Real-time messaging system
│   ├── forum/                 # Forum & discussion system
│   ├── media-assets/          # Stickers, emojis, GIFs management
│   ├── media-hosting/         # Media processing & CDN
│   ├── uploads/               # File upload & storage
│   └── common/                # Shared utilities & infrastructure
├── libs/                      # External service integrations
│   ├── cloudflare-r2/         # R2 storage integration
│   └── supabase/              # Supabase integration
└── prisma/                    # Database schema & migrations
```

## 🎯 Key Features

### 🔐 Authentication & Security
- **JWT Authentication** with refresh tokens
- **Social Login** (Google, Twitter, Facebook, GitHub, Discord)
- **Two-Factor Authentication** (TOTP)
- **Rate Limiting** and brute force protection
- **Session Management** and device tracking
- **Password Security** with Argon2 hashing

### 👥 User Management
- **Rich User Profiles** with avatars and banners
- **Privacy Controls** with granular settings
- **Security Dashboard** with login history
- **Cryptographic Operations** for secure data
- **User Analytics** and behavior tracking
- **GDPR Compliance** with data export/deletion

### 💬 Real-time Messaging
- **Direct Messages** and group chats
- **File Sharing** with media support
- **Voice Messages** and rich content
- **Read Receipts** and typing indicators
- **Message Encryption** (optional E2E)
- **Push Notifications** across platforms

### 🗣️ Forum System
- **Threaded Discussions** with nested replies
- **Category Management** and organization
- **Full-text Search** with advanced filtering
- **Content Moderation** tools and workflows
- **Real-time Updates** and notifications
- **Trending Content** and analytics

### 🎨 Media Assets
- **Sticker Packs** with monetization support
- **Custom Emojis** for chats and global use
- **GIF Management** with categories and trending
- **Bulk Operations** for efficient management
- **Usage Analytics** and popularity tracking
- **Content Moderation** and approval workflows

### 🎬 Media Hosting
- **Global CDN** distribution
- **Image/Video Processing** with optimization
- **Format Conversion** and compression
- **Responsive Images** with multiple sizes
- **Smart Caching** and invalidation
- **Performance Analytics** and monitoring

### 📁 File Management
- **Scalable Uploads** with chunked support
- **Cloudflare R2** integration
- **Virus Scanning** and security validation
- **Metadata Extraction** and thumbnails
- **Storage Optimization** with tiered storage
- **Backup & Redundancy** across regions

## 🛠️ Technology Stack

### Backend Framework
- **NestJS** - Scalable Node.js framework
- **TypeScript** - Type-safe development
- **Express** - HTTP server foundation

### Database & Storage
- **PostgreSQL** - Primary database with optimization
- **Prisma** - Type-safe database ORM
- **Redis** - Caching and session storage
- **Cloudflare R2** - Object storage and CDN

### Real-time & Communication
- **Socket.IO** - WebSocket communication
- **Bull** - Background job processing
- **Node-cron** - Scheduled tasks

### Security & Validation
- **Passport** - Authentication strategies
- **Argon2** - Password hashing
- **Class-validator** - Input validation
- **Helmet** - Security headers

### Media & File Processing
- **Sharp** - Image processing
- **FFmpeg** - Video/audio processing
- **Multer** - File upload handling

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL 14+
- Redis 6+
- Docker (optional)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd awe-server

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env
# Edit .env with your configuration

# Setup database
npm run db:migrate
npm run db:seed

# Start the application
npm run start:dev
```

### Environment Configuration

```bash
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/awe"
SHADOW_DATABASE_URL="postgresql://user:password@localhost:5432/awe_shadow"

# Redis
REDIS_HOST="localhost"
REDIS_PORT=6379
REDIS_PASSWORD=""

# JWT
JWT_SECRET="your-jwt-secret"
JWT_REFRESH_SECRET="your-refresh-secret"

# Cloudflare R2
R2_ENDPOINT="https://your-account.r2.cloudflarestorage.com"
R2_ACCESS_KEY_ID="your-access-key"
R2_SECRET_ACCESS_KEY="your-secret-key"
R2_BUCKET_NAME="your-bucket"

# Social Auth (optional)
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
# ... other social providers
```

## 📚 Module Documentation

Each module has comprehensive documentation:

- [**Authentication Module**](src/modules/auth/README.md) - Auth, security, and user session management
- [**Users Module**](src/modules/users/README.md) - User profiles, settings, and security features
- [**Messenger Module**](src/modules/messanger/README.md) - Real-time messaging and communication
- [**Forum Module**](src/modules/forum/README.md) - Discussion forums and community features
- [**Media Assets Module**](src/modules/media-assets/README.md) - Stickers, emojis, and GIFs
- [**Media Hosting Module**](src/modules/media-hosting/README.md) - Media processing and CDN
- [**Uploads Module**](src/modules/uploads/README.md) - File upload and storage management
- [**Common Module**](src/modules/common/README.md) - Shared utilities and infrastructure

## 🔧 Development

### Available Scripts

```bash
# Development
npm run start:dev          # Start in watch mode
npm run start:debug        # Start with debugging

# Building
npm run build              # Build for production
npm run start:prod         # Start production build

# Testing
npm run test               # Run unit tests
npm run test:e2e           # Run integration tests
npm run test:cov           # Run tests with coverage

# Database
npm run db:migrate         # Run database migrations
npm run db:seed            # Seed database with sample data
npm run db:studio          # Open Prisma Studio
npm run db:reset           # Reset database (development only)

# Code Quality
npm run lint               # Run ESLint
npm run format             # Format code with Prettier
npm run type-check         # TypeScript type checking
```

### API Documentation

When running in development, Swagger documentation is available at:
- **Swagger UI**: `http://localhost:3000/api`
- **OpenAPI JSON**: `http://localhost:3000/api-json`

### Database Management

```bash
# Generate Prisma client
npx prisma generate

# Create new migration
npx prisma migrate dev --name migration-name

# Apply migrations to production
npx prisma migrate deploy

# Reset database (development only)
npx prisma migrate reset

# Open Prisma Studio
npx prisma studio
```

## 🐳 Docker Deployment

```bash
# Build Docker image
docker build -t awe-server .

# Run with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f awe-server
```

## 📊 Performance & Monitoring

### Built-in Features
- **Health Checks** for all services
- **Metrics Collection** with Prometheus format
- **Request Logging** with correlation IDs
- **Error Tracking** with stack traces
- **Performance Monitoring** for slow queries

### Monitoring Endpoints
- **Health**: `/health`
- **Metrics**: `/metrics`
- **Database**: `/health/database`
- **Redis**: `/health/redis`
- **Storage**: `/health/storage`

## 🔒 Security Features

### Authentication & Authorization
- JWT-based authentication with refresh tokens
- Role-based access control (RBAC)
- Social login integration
- Two-factor authentication support
- Session management and device tracking

### Input Validation & Sanitization
- Comprehensive input validation with class-validator
- XSS protection and HTML sanitization
- SQL injection prevention with Prisma
- File upload validation and virus scanning
- Rate limiting and DDoS protection

### Data Protection
- Encryption at rest and in transit
- Secure password hashing with Argon2
- GDPR compliance with data export/deletion
- Audit logging for sensitive operations
- Regular security updates and patches

## 🚀 Deployment

### Production Checklist

- [ ] Configure environment variables
- [ ] Set up SSL certificates
- [ ] Configure reverse proxy (nginx/CloudFlare)
- [ ] Set up monitoring and alerting
- [ ] Configure backup strategies
- [ ] Review security settings
- [ ] Test disaster recovery procedures

### Scaling Considerations

- **Horizontal Scaling**: Multiple server instances behind load balancer
- **Database Scaling**: Read replicas and connection pooling
- **Caching**: Redis cluster for distributed caching
- **File Storage**: CDN for global content delivery
- **Background Jobs**: Separate worker processes

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow TypeScript and ESLint rules
- Write comprehensive tests for new features
- Update documentation for API changes
- Follow conventional commit messages
- Ensure all tests pass before submitting PR

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📞 Support

- **Documentation**: Check module-specific README files
- **Issues**: Report bugs and feature requests on GitHub
- **Discussions**: Join community discussions
- **Email**: Contact the development team

---

<p align="center">
  Built with ❤️ using NestJS and TypeScript
</p>
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
