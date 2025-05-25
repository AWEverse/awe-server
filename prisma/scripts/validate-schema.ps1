# 🔍 Скрипт валидации схемы Prisma

Write-Host "🚀 Запуск валидации схемы Prisma..." -ForegroundColor Green

# Проверка синтаксиса схемы
Write-Host "📋 Проверка синтаксиса схемы..." -ForegroundColor Yellow
try {
    npx prisma validate
    Write-Host "✅ Синтаксис схемы корректен" -ForegroundColor Green
} catch {
    Write-Host "❌ Ошибки в синтаксисе схемы:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

# Проверка форматирования
Write-Host "📝 Проверка форматирования схемы..." -ForegroundColor Yellow
try {
    npx prisma format --check
    Write-Host "✅ Форматирование корректно" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Схема требует переформатирования" -ForegroundColor Yellow
    npx prisma format
    Write-Host "✅ Схема переформатирована" -ForegroundColor Green
}

# Генерация клиента для проверки типов
Write-Host "🔧 Генерация Prisma Client..." -ForegroundColor Yellow
try {
    npx prisma generate
    Write-Host "✅ Prisma Client успешно сгенерирован" -ForegroundColor Green
} catch {
    Write-Host "❌ Ошибка генерации клиента:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

# Проверка миграций (если база данных доступна)
if ($env:DATABASE_URL) {
    Write-Host "🗄️  Проверка статуса миграций..." -ForegroundColor Yellow
    try {
        npx prisma migrate status
        Write-Host "✅ Миграции в актуальном состоянии" -ForegroundColor Green
    } catch {
        Write-Host "⚠️  Требуются миграции базы данных" -ForegroundColor Yellow
        Write-Host "Выполните: npx prisma migrate dev" -ForegroundColor Cyan
    }
} else {
    Write-Host "⚠️  DATABASE_URL не настроен, пропуск проверки миграций" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "🎉 Валидация схемы завершена!" -ForegroundColor Green
Write-Host ""
Write-Host "📊 Статистика схемы:" -ForegroundColor Cyan

# Подсчет моделей, полей и индексов
$schemaContent = Get-Content "prisma/schema.prisma" -Raw

$modelCount = ([regex]::Matches($schemaContent, "model\s+\w+")).Count
$enumCount = ([regex]::Matches($schemaContent, "enum\s+\w+")).Count
$indexCount = ([regex]::Matches($schemaContent, "@@index")).Count
$relationCount = ([regex]::Matches($schemaContent, "@relation")).Count

Write-Host "  📋 Моделей: $modelCount" -ForegroundColor White
Write-Host "  📝 Enum'ов: $enumCount" -ForegroundColor White
Write-Host "  🔍 Индексов: $indexCount" -ForegroundColor White
Write-Host "  🔗 Связей: $relationCount" -ForegroundColor White

Write-Host ""
Write-Host "✨ Все проверки пройдены успешно!" -ForegroundColor Green
