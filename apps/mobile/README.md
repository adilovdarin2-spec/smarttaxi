# SmartTaxi Mobile

Expo React Native app for the same SmartTaxi backend API used by web/PWA.

## Environment

Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

Required values:

```txt
EXPO_PUBLIC_API_URL=https://api.smarttaxi.kz
EXPO_PUBLIC_GOOGLE_MAPS_KEY=
```

Do not hardcode localhost in the app. For local device testing, use a reachable LAN/API URL in `.env`.

## Run

```bash
npm install
npx expo start
```

## Android Build

```bash
npx eas build -p android
```

## iOS Build

```bash
npx eas build -p ios
```

## Screens

- Client home
- Client active order
- Client history placeholder
- Driver login
- Driver orders
- Driver active trip
- Driver stats
- Owner dashboard basic

## Services

- `src/services/api.ts`
- `src/services/socket.ts`
- `src/services/location.ts`
- `src/services/auth.ts`
