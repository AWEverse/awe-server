# Forum Module

Простой модуль для работы с форумом в приложении AWE Server.

## Описание

Модуль предоставляет функциональность для:
- Создания и управления форумами
- Создания категорий внутри форумов
- Создания постов в категориях
- Создания ответов на посты
- Работы с тегами для постов

## Структура базы данных

### Модели Prisma
- `Forum` - основной контейнер для категорий и постов
- `ForumCategory` - категории внутри форума
- `ForumPost` - посты в категориях
- `ForumReply` - ответы на посты
- `ForumTag` - теги для постов
- `ForumPostTag` - связующая таблица для постов и тегов

## API Endpoints

### Форумы

#### `POST /forum`
Создать новый форум
```json
{
  "name": "Название форума",
  "slug": "forum-slug",
  "description": "Описание форума (опционально)"
}
```

#### `GET /forum`
Получить список всех форумов

#### `GET /forum/:slug`
Получить форум по slug

#### `POST /forum/:forumId/categories`
Создать категорию в форуме
```json
{
  "name": "Название категории",
  "slug": "category-slug",
  "description": "Описание категории (опционально)"
}
```

#### `GET /forum/:forumId/categories`
Получить категории форума

#### `DELETE /forum/:id`
Удалить форум (только владелец)

### Посты

#### `POST /forum/categories/:categoryId/posts`
Создать пост в категории
```json
{
  "title": "Заголовок поста",
  "content": "Содержимое поста",
  "slug": "post-slug",
  "tags": ["тег1", "тег2"] // опционально
}
```

#### `GET /forum/categories/:categoryId/posts`
Получить посты категории
- Query параметры: `page` (по умолчанию 1), `limit` (по умолчанию 10)

#### `GET /forum/posts/:slug`
Получить пост по slug

#### `POST /forum/posts/:postId/replies`
Создать ответ на пост
```json
{
  "content": "Содержимое ответа"
}
```

#### `GET /forum/posts/:postId/replies`
Получить ответы на пост
- Query параметры: `page` (по умолчанию 1), `limit` (по умолчанию 20)

#### `DELETE /forum/posts/:id`
Удалить пост (только автор)

#### `DELETE /forum/replies/:id`
Удалить ответ (только автор)

## Использование

### Импорт модуля

```typescript
import { ForumModule } from './modules/forum';

@Module({
  imports: [
    // другие модули...
    ForumModule,
  ],
})
export class AppModule {}
```

### Использование сервисов

```typescript
import { ForumService, ForumPostService } from './modules/forum';

@Injectable()
export class SomeService {
  constructor(
    private readonly forumService: ForumService,
    private readonly forumPostService: ForumPostService,
  ) {}

  async createForum() {
    return this.forumService.createForum({
      name: 'Мой форум',
      slug: 'my-forum',
      description: 'Описание моего форума'
    }, BigInt(1)); // ID владельца
  }
}
```

## Особенности

- Использует BigInt ID для оптимизации производительности
- Поддерживает пагинацию для списков
- Автоматическое создание и связывание тегов
- Валидация уникальности slug
- Проверка прав доступа для операций удаления
- Подсчет количества постов и ответов

## Зависимости

- `@nestjs/common`
- `@nestjs/swagger`
- `class-validator`
- `class-transformer`
- `prisma`

## TODO

- [ ] Добавить аутентификацию и авторизацию
- [ ] Добавить полнотекстовый поиск
- [ ] Добавить модерацию контента
- [ ] Добавить систему рейтингов
- [ ] Добавить уведомления
- [ ] Добавить файлы и изображения к постам
