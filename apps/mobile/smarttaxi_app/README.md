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

Подставьте LAN-IP компьютера вместо `192.168.1.10`, например
`http://192.168.1.10:4001`. Телефон и ПК должны быть в одной Wi-Fi сети.

```powershell
flutter run `
  --dart-define=API_BASE_URL=http://192.168.1.10:4001 `
  --dart-define=SOCKET_URL=http://192.168.1.10:4001
```

Для доступа телефона добавьте его origin в `CORS_ORIGINS` в корневом `.env`
и перезапустите только API:

```powershell
docker compose up -d --build api
```

## Проверки

```powershell
flutter analyze
flutter test
docker exec smarttaxi-api npm run check
```
