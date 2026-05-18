# PROMPT FOR DEVELOPER AI — SmartTaxi Frontend Implementation

Ты — senior Flutter / React Native / frontend developer. Нужно реализовать интерфейс SmartTaxi по дизайну.

## Цель
Создать мобильное приложение клиента, приложение водителя и веб-панели оператора/админа в единой бело-золотой дизайн-системе.

## Технологии на выбор
Mobile:
- Flutter или React Native.

Web panels:
- React / Next.js.

Map:
- OpenStreetMap + Leaflet на web.
- flutter_map / osm tiles на Flutter.

## Роли
1. client
2. driver
3. operator
4. admin

## Основные маршруты приложения

Client:
/login
/client/register
/client/home
/client/address
/client/payment
/client/searching
/client/ride
/client/complete
/client/history
/client/profile
/client/support
/client/notifications

Driver:
/driver/register
/driver/home
/driver/order
/driver/ride
/driver/balance
/driver/history
/driver/profile
/driver/support

Operator:
/operator/dashboard
/operator/tickets
/operator/ticket/:id
/operator/chat
/operator/manual-assignment

Admin:
/admin/dashboard
/admin/users
/admin/drivers
/admin/trips
/admin/finance
/admin/promos
/admin/support
/admin/settings

## Design tokens

colors:
primaryGold: #F6B800
goldLight: #FFD45C
background: #F8F7F2
surface: #FFFFFF
textPrimary: #111827
textSecondary: #6B7280
border: #E8E0CB
darkSidebar: #172026
success: #16A34A
danger: #EF4444

radius:
small: 12
medium: 16
large: 24
xl: 32

spacing:
xs: 4
sm: 8
md: 16
lg: 24
xl: 32

typography:
font: Inter / SF Pro / system
h1: 32 bold
h2: 24 bold
h3: 20 semibold
body: 16 regular
caption: 12 medium

## UX rules
- Primary CTA is always gold.
- Secondary button is white with border.
- Dangerous actions are red but used rarely.
- Use skeleton/loading states for map and order search.
- Do not show admin features to clients.
- Do not show driver features to clients.
- Use role-based routing.
- Keep bottom navigation simple.
- Keep forms short.
- Driver registration can be multi-step.

## Components to implement
ButtonPrimary
ButtonSecondary
ButtonDanger
AppInput
PhoneInput
PasswordInput
AddressInput
TariffCard
PaymentMethodRow
DriverCard
RideStatusCard
MapView
BottomNav
SideBar
AdminStatCard
OperatorTicketCard
ChatBubble
NotificationItem
EmptyState
LoadingState
ErrorState
PromoCard
BonusCard

## Ride state machine
draft
priced
searching
assigned
driver_arriving
arrived
in_trip
completed
cancelled_by_client
cancelled_by_driver
cancelled_by_operator

## Required logic
Client:
- Choose pickup and destination.
- Select tariff.
- Select payment method.
- Calculate estimate.
- Start searching.
- Show assigned driver.
- Show trip status.
- Complete and rate.

Driver:
- Toggle online/offline.
- Receive new order.
- Accept/reject order.
- Navigate to pickup.
- Start trip.
- Complete trip.
- See balance/history.

Operator:
- See all support tickets.
- Filter by status.
- Open order details.
- Chat with client/driver.
- Assign driver manually.
- Close ticket.

Admin:
- See metrics.
- Manage users.
- Manage drivers.
- Manage trips.
- See finance.
- Manage promos.
- Manage support.

## Output format
Give complete code, file structure, components, routing, mock data, and clear instructions where to insert each file.
Do not provide only snippets. Do not remove existing working logic.
