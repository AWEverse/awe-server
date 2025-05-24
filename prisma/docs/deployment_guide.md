# Высокопроизводительные процедуры PostgreSQL для AWE

Этот пакет содержит специально разработанные процедуры, функции и оптимизации для PostgreSQL, учитывающие специфику мультимедийной платформы AWE.

## 📁 Структура файлов

- `high_performance_procedures.sql` - Основные высокопроизводительные процедуры
- `postgresql_optimizations.sql` - Продвинутые оптимизации специфичные для PostgreSQL  
- `postgresql.conf.optimized` - Оптимизированная конфигурация PostgreSQL
- `deployment_guide.md` - Руководство по развертыванию (этот файл)

## 🚀 Быстрое развертывание

### 1. Применение процедур

```sql
-- Подключитесь к вашей базе данных
\c awe_database

-- Установите необходимые расширения
\i high_performance_procedures.sql
\i postgresql_optimizations.sql
```

### 2. Применение конфигурации PostgreSQL

```bash
# Сделайте резервную копию текущей конфигурации
sudo cp /etc/postgresql/15/main/postgresql.conf /etc/postgresql/15/main/postgresql.conf.backup

# Примените новую конфигурацию (осторожно!)
sudo cp postgresql.conf.optimized /etc/postgresql/15/main/postgresql.conf

# Перезапустите PostgreSQL
sudo systemctl restart postgresql
```

## 📊 Основные функции

### Пользователи и аутентификация

```sql
-- Создание пользователя с криптографией
SELECT create_user_with_crypto(
    'user@example.com',
    'username',
    'password_hash',
    'Full Name',
    '+1234567890',
    'identity_key_public'
);

-- Поиск пользователей
SELECT * FROM search_users('john', 20, 0);

-- Обновление статистики пользователя
SELECT update_user_stats(user_id);
```

### Мессенджер

```sql
-- Создание чата с участниками
SELECT create_chat_with_participants(
    'GROUP',
    creator_id,
    'Chat Title',
    ARRAY[user1_id, user2_id, user3_id],
    true -- публичный
);

-- Отправка сообщения
SELECT send_message(
    chat_id,
    sender_id,
    content_bytes,
    header_bytes,
    'TEXT',
    reply_to_message_id
);

-- Получение сообщений
SELECT * FROM get_chat_messages(chat_id, user_id, 50, before_message_id);

-- Отметка как прочитанное
SELECT mark_messages_read(chat_id, user_id, up_to_message_id);
```

### Контент и медиа

```sql
-- Создание контента
SELECT create_content(
    author_id,
    'VIDEO',
    'Video Title',
    'Description',
    'thumbnail_url',
    ARRAY['tag1', 'tag2', 'tag3'],
    '{"duration": 180, "resolution": "1080p"}'::jsonb
);

-- Инкремент просмотров
SELECT increment_content_view(content_id, user_id, watch_time_seconds, completed);

-- Получение рекомендаций
SELECT * FROM get_content_recommendations(user_id, 20, ARRAY['VIDEO', 'SHORT_VIDEO']);
```

### Социальные функции

```sql
-- Лайк/дизлайк
SELECT toggle_like(user_id, content_id, NULL, 1); -- лайк
SELECT toggle_like(user_id, content_id, NULL, -1); -- дизлайк

-- Подписка
SELECT subscribe_to_user(subscriber_id, target_user_id, true);
```

### Форум

```sql
-- Создание поста
SELECT create_forum_post(category_id, author_id, 'Title', 'Content');

-- Ответ на пост
SELECT create_forum_reply(post_id, author_id, 'Reply content');
```

## 🔧 Продвинутые функции

### Массовые операции

```sql
-- Массовая вставка сообщений (для миграции)
SELECT bulk_insert_messages('[
    {
        "chatId": "123",
        "senderId": "456", 
        "content": "base64_encoded_content",
        "header": "base64_encoded_header",
        "messageType": "TEXT",
        "createdAt": "2023-01-01T00:00:00Z"
    }
]'::jsonb);

-- Массовое обновление статистики
SELECT bulk_update_user_stats(); -- все пользователи
SELECT bulk_update_user_stats(ARRAY[1,2,3,4,5]); -- конкретные
```

### Аналитика

```sql
-- Аналитика активности пользователей
SELECT * FROM get_user_activity_analytics(30); -- за 30 дней

-- Аналитика производительности контента  
SELECT * FROM get_content_performance_analytics(content_id, 24); -- за 24 часа
```

### Безопасность

```sql
-- Детекция подозрительной активности
SELECT * FROM detect_suspicious_activity(); -- все пользователи
SELECT * FROM detect_suspicious_activity(user_id, 1); -- конкретный за час

-- Логирование безопасности
SELECT log_security_event(
    user_id,
    'failed_login',
    'Multiple failed login attempts',
    '192.168.1.1'::inet,
    'Mozilla/5.0...',
    '{"attempts": 3}'::jsonb
);
```

## 🛠 Обслуживание и мониторинг

### Автоматические процедуры

```sql
-- Ежедневное обслуживание
SELECT daily_maintenance();

-- Еженедельное обслуживание  
SELECT weekly_maintenance();

-- Очистка устаревших данных
SELECT cleanup_old_data();

-- Архивирование
SELECT intelligent_archive_data('6 months'::interval, true);
```

### Мониторинг

```sql
-- Отчет о состоянии системы
SELECT * FROM get_system_health_report();

-- Обновление статистики таблиц
SELECT update_table_statistics();

-- Создание партиций
SELECT create_monthly_partitions('MessageArchive', 3);
```

## 📈 Представления для быстрых запросов

```sql
-- Активные чаты пользователя
SELECT * FROM user_active_chats WHERE "userId" = user_id;

-- Трендовый контент
SELECT * FROM trending_content ORDER BY trending_score DESC LIMIT 20;
```

## ⚡ Оптимизации производительности

### Важные индексы уже созданы:

- Композитные индексы для частых запросов
- GIN индексы для полнотекстового поиска
- Частичные индексы для активных данных
- Индексы для сортировки по времени

### Автоматические триггеры:

- Обновление search_vector для пользователей
- Обновление счетчиков участников чатов
- Автоматическое логирование изменений

## 🔄 Настройка автоматических задач

### Cron задачи (добавить в crontab):

```bash
# Ежедневное обслуживание в 3:00
0 3 * * * psql -d awe_database -c "SELECT daily_maintenance();"

# Еженедельное обслуживание в воскресенье в 2:00
0 2 * * 0 psql -d awe_database -c "SELECT weekly_maintenance();"

# Обновление трендовых тегов каждый час
0 * * * * psql -d awe_database -c "SELECT update_trending_tags();"

# Детекция подозрительной активности каждые 15 минут
*/15 * * * * psql -d awe_database -c "INSERT INTO SecurityAuditLog (action, description, metadata) SELECT 'suspicious_activity_check', 'Automated scan', jsonb_agg(to_jsonb(t)) FROM (SELECT * FROM detect_suspicious_activity() LIMIT 10) t;"
```

## 🚨 Важные предупреждения

### Конфигурация PostgreSQL:
- **НЕ** используйте `fsync=off` в продакшене
- Настройки рассчитаны на сервер с 16GB RAM
- Адаптируйте параметры под ваше железо

### Безопасность:
- Регулярно мониторьте логи безопасности
- Настройте алерты на критические события
- Используйте SSL соединения

### Производительность:
- Мониторьте медленные запросы через `pg_stat_statements`
- Регулярно обновляйте статистику таблиц
- Следите за размером WAL файлов

## 📞 Мониторинг и алерты

### Критические метрики для мониторинга:

```sql
-- Активные соединения
SELECT count(*) FROM pg_stat_activity WHERE state = 'active';

-- Размер базы данных
SELECT pg_size_pretty(pg_database_size('awe_database'));

-- Топ медленных запросов
SELECT query, calls, total_time, mean_time 
FROM pg_stat_statements 
ORDER BY total_time DESC LIMIT 10;

-- Блокировки
SELECT * FROM pg_locks WHERE NOT granted;

-- Репликационная задержка (если используется)
SELECT client_addr, state, sync_state, 
       pg_wal_lsn_diff(pg_current_wal_lsn(), sent_lsn) as lag_bytes
FROM pg_stat_replication;
```

## 🔧 Troubleshooting

### Частые проблемы:

1. **Медленные запросы**: Проверьте `pg_stat_statements` и добавьте индексы
2. **Высокое использование CPU**: Оптимизируйте `work_mem` и `shared_buffers`
3. **Блокировки**: Анализируйте `pg_locks` и оптимизируйте транзакции
4. **Большой размер WAL**: Настройте `checkpoint_timeout` и `max_wal_size`

### Команды для диагностики:

```sql
-- Анализ производительности
EXPLAIN (ANALYZE, BUFFERS, VERBOSE) SELECT ...;

-- Перестроение статистики
ANALYZE table_name;

-- Принудительный checkpoint
CHECKPOINT;

-- Информация о блокировках
SELECT * FROM pg_blocking_pids(process_id);
```

## 📖 Дополнительная документация

- [PostgreSQL Performance Tuning](https://wiki.postgresql.org/wiki/Performance_Optimization)
- [Monitoring PostgreSQL](https://wiki.postgresql.org/wiki/Monitoring)
- [PostgreSQL Security](https://www.postgresql.org/docs/current/security.html)

---

**Автор**: GitHub Copilot  
**Версия**: 1.0  
**Дата**: 2025-05-24
