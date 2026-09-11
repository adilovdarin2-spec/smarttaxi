# SmartTaxi Flutter

Пассажирское и водительское мобильное приложение SmartTaxi. Бэкенд, PostgreSQL
и Redis запускаются из корня репозитория через Docker Compose.

## Локальный запуск с Docker

Из корня репозитория:

```powershell
docker compose up -d --build
docker compose ps
```

Готовность API можно проверить так:

```powershell
Invoke-WebRequest http://127.0.0.1:4001/api/health/ready
```

## Запуск приложения

### Flutter Web на этом ПК

```powershell
flutter run -d chrome `
  --dart-define=API_BASE_URL=http://127.0.0.1:4001 `
  --dart-define=SOCKET_URL=http://127.0.0.1:4001
```

### Android Emulator

`10.0.2.2` — это адрес хоста из Android Emulator.

```powershell
flutter run `
  --dart-define=API_BASE_URL=http://10.0.2.2:4001 `
  --dart-define=SOCKET_URL=http://10.0.2.2:4001
```

### Физический телефон

Для локального QA используйте USB и ADB reverse. Docker-порты по умолчанию
привязаны только к loopback компьютера, поэтому этот способ не раскрывает dev
API в локальную сеть и не требует менять `CORS_ORIGINS`.

```powershell
adb devices -l
adb reverse tcp:4001 tcp:4001
adb reverse tcp:5175 tcp:5175
flutter run -d <serial> `
  --dart-define=API_BASE_URL=http://127.0.0.1:4001 `
  --dart-define=SOCKET_URL=http://127.0.0.1:4001 `
  --dart-define=WEB_BASE_URL=http://127.0.0.1:5175
```

LAN-доступ включайте только осознанно для отдельного QA-стека: задайте
`SMARTTAXI_API_BIND_HOST=0.0.0.0`, используйте IP компьютера в dart-define и
ограничьте доступ сетевым экраном. Не используйте этот режим для production.

```powershell
$env:SMARTTAXI_API_BIND_HOST='0.0.0.0'
docker compose up -d --build api
```

## Проверки

```powershell
flutter analyze
flutter test
docker exec smarttaxi-api npm run check
```
