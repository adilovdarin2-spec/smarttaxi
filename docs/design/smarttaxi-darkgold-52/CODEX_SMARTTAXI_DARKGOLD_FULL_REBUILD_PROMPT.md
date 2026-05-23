# SMARTTAXI — FULL UI/UX REBUILD FROM 52 DARK/GOLD REFERENCE SCREENS

You are working in the SmartTaxi repository.

## Goal

The old app UI is no longer valid. The design direction changed completely to a premium dark luxury black/gold interface.

Your task is to delete/rewrite the old frontend UI and rebuild the application UI based on the 52 PNG reference screens in this handoff package.

The result must look like the reference images: same dark/gold visual language, same rounded cards, same spacing logic, same navigation structure, same premium taxi feeling.

## Absolute source of truth

Use the PNG files in:

`docs/design/smarttaxi-darkgold-52/screens/`

These screenshots are the visual source of truth for the mobile client and driver UI.

Admin and operator web panels should be designed by you, but they MUST use the same visual system:
- dark graphite/black background;
- gold primary accent;
- glass/dark rounded cards;
- clean line icons;
- SmartTaxi branding;
- no old white/gold fake screens;
- no random TaxiApp / TaxiDriver names.

## Brand rules

Service name: `SmartTaxi`

Logo:
- Gold shield/hexagon with the letter `S`.
- Use the same logo style shown in the screenshots.
- Do NOT use TaxiApp, TaxiDriver, generic taxi icon, or random app names.

Main style:
- Dark luxury black/gold.
- Background: `#050607`, `#090B0F`, `#0E1116`.
- Cards: dark translucent graphite `rgba(20,22,26,.88)`.
- Borders: subtle gray/gold `rgba(255,255,255,.10)` and `rgba(255,196,0,.35)`.
- Primary gold: `#FFC21A`.
- Gold gradient: `linear-gradient(180deg, #FFD966 0%, #F2B400 100%)`.
- Text primary: `#FFFFFF`.
- Text secondary: `#A7A7A7`.
- Positive: `#4CD964`.
- Danger: `#FF453A`.
- Icons: clean SVG, white/gold, no emoji.
- Typography: Inter/SF Pro style.

## Protected files

DO NOT delete or modify:
- `.env*`
- secrets
- API keys
- VPS/SSH configs
- docker-compose files
- nginx configs
- deployment scripts
- backend business logic unless a compile fix is strictly required
- database migrations unless unrelated old UI references break the build

You may modify frontend source files, frontend routing, frontend components, frontend styles, and frontend mock data.

## Delete/rebuild scope

Remove or replace:
- old frontend UI components;
- old styles;
- old theme tokens;
- old mock screens;
- old white/gold UI experiments;
- old dark/gold implementations that do not match these screenshots;
- broken/unused role layouts.

Recommended rewrite scope:
- `apps/web/src`
- client/driver/operator/admin frontend UI modules
- CSS/Tailwind theme tokens
- frontend mock data

Keep the project structure clean and maintainable.

## Architecture requirements

Build role-based UI:

### Client
Routes:
- `/client`
- `/client/login`
- `/client/register`
- `/client/home`
- `/client/address`
- `/client/tariffs`
- `/client/search-driver`
- `/client/ride`
- `/client/payments`
- `/client/bonuses`
- `/client/promocodes`
- `/client/notifications`
- `/client/support`
- `/client/settings`
- `/client/profile`

### Driver
Routes:
- `/driver`
- `/driver/home`
- `/driver/orders`
- `/driver/order/:id`
- `/driver/ride`
- `/driver/earnings`
- `/driver/withdraw`
- `/driver/bonuses`
- `/driver/support`
- `/driver/settings`
- `/driver/profile`
- `/driver/security`

### Operator
Codex should design this itself based on the same design system:
- `/operator`
- active orders list
- order detail
- assign driver
- chat
- map placeholder
- filters/statuses

### Admin
Codex should design this itself based on the same design system:
- `/admin`
- dashboard
- drivers
- clients
- trips
- finance
- tariffs
- promo codes
- settings

## Screens included in this package

01. Splash Loading — `screens/01_Splash_Loading.png`
02. Login — `screens/02_Login.png`
03. Client Register — `screens/03_Client_Register.png`
04. Client Home — `screens/04_Client_Home.png`
05. Address Search — `screens/05_Address_Search.png`
06. Tariff Select — `screens/06_Tariff_Select.png`
07. Driver Search — `screens/07_Driver_Search.png`
08. Client Ride — `screens/08_Client_Ride.png`
09. Driver Home Updated — `screens/09_Driver_Home_Updated.png`
10. Driver New Order — `screens/10_Driver_New_Order.png`
11. Driver On Place Start Ride — `screens/11_Driver_On_Place_Start_Ride.png`
12. Driver Menu Profile — `screens/12_Driver_Menu_Profile.png`
13. Driver Earnings Statistics — `screens/13_Driver_Earnings_Statistics.png`
14. Driver Order History — `screens/14_Driver_Order_History.png`
15. Driver Completed Order Details — `screens/15_Driver_Completed_Order_Details.png`
16. Driver Withdraw Funds — `screens/16_Driver_Withdraw_Funds.png`
17. Driver Bonuses Guarantees — `screens/17_Driver_Bonuses_Guarantees.png`
18. Driver Support Center — `screens/18_Driver_Support_Center.png`
19. Driver Settings Profile — `screens/19_Driver_Settings_Profile.png`
20. Driver Orders Trips — `screens/20_Driver_Orders_Trips.png`
21. Driver New Order Details — `screens/21_Driver_New_Order_Details.png`
22. Driver Active Trip Finish — `screens/22_Driver_Active_Trip_Finish.png`
23. Driver Trip Completed Summary — `screens/23_Driver_Trip_Completed_Summary.png`
24. Driver Home Queue Mode — `screens/24_Driver_Home_Queue_Mode.png`
25. Payments Balance — `screens/25_Payments_Balance.png`
26. Bonuses Overview — `screens/26_Bonuses_Overview.png`
27. Promo Codes — `screens/27_Promo_Codes.png`
28. Notifications — `screens/28_Notifications.png`
29. Support Chat — `screens/29_Support_Chat.png`
30. Client Settings — `screens/30_Client_Settings.png`
31. Client Payment Methods — `screens/31_Client_Payment_Methods.png`
32. Driver Income History — `screens/32_Driver_Income_History.png`
33. Driver Analytics — `screens/33_Driver_Analytics.png`
34. Support Help — `screens/34_Support_Help.png`
35. About App SmartTaxi — `screens/35_About_App_SmartTaxi.png`
36. Client Bonus History — `screens/36_Client_Bonus_History.png`
37. Referral Program — `screens/37_Referral_Program.png`
38. Notifications Extended — `screens/38_Notifications_Extended.png`
39. Support FAQ Center — `screens/39_Support_FAQ_Center.png`
40. About App Details — `screens/40_About_App_Details.png`
41. Client Profile — `screens/41_Client_Profile.png`
42. Edit Client Profile — `screens/42_Edit_Client_Profile.png`
43. Account Security — `screens/43_Account_Security.png`
44. Notification Settings — `screens/44_Notification_Settings.png`
45. Language Selection — `screens/45_Language_Selection.png`
46. Theme Selection — `screens/46_Theme_Selection.png`
47. Privacy Settings — `screens/47_Privacy_Settings.png`
48. Help And Support — `screens/48_Help_And_Support.png`
49. About SmartTaxi Corrected — `screens/49_About_SmartTaxi_Corrected.png`
50. System Info — `screens/50_System_Info.png`
51. Clear Cache — `screens/51_Clear_Cache.png`
52. Appearance Settings — `screens/52_Appearance_Settings.png`

## Map/API rule for this stage

Map integration is deferred.

Use OSM-style mock/dark map placeholders that visually match the screenshots.
Do NOT implement MapTiler/Geoapify/OpenRouteService/OSRM in this UI stage.
Do NOT call external map APIs yet.

## Functional scope for this stage

UI/UX only with local hardcoded demo data.

Allowed:
- local route switching;
- local tabs;
- local selected states;
- fake status changes;
- mock cards/lists/charts;
- responsive layout;
- reusable components.

Not allowed yet:
- real auth;
- real driver matching;
- real payments;
- real map APIs;
- backend order lifecycle wiring;
- WebSocket integration.

## Required UI components

Create a clean design system:
- AppShell
- PhoneScreen wrapper / mobile layout
- BottomNav
- Header
- IconButton
- PrimaryButton
- SecondaryButton
- GlassCard
- StatCard
- ListRow
- Toggle
- SegmentedTabs
- MapMock
- VehicleCard
- DriverCard
- OrderCard
- PaymentCard
- NotificationRow
- SettingsRow
- ChartCard

No emoji. Use SVG icons from lucide-react or inline SVG.

## Acceptance checklist

Before final commit, verify:

1. All routes render without white screen.
2. No horizontal overflow on 360/390/430px.
3. Mobile bottom navigation does not overlap content.
4. Buttons are clickable and states change locally.
5. Dark/gold design is consistent everywhere.
6. No old white/gold UI remains.
7. No random app names remain.
8. Search repo for forbidden names:
   - `TaxiApp`
   - `TaxiDriver`
   - old `white-gold`
   - unrelated placeholder brand names
9. Search repo for emoji in UI text/components and remove them.
10. Build passes:
   - `npm run syntax`
   - `npm run check`
   - `npm run build`
   - `npm --prefix apps/web run build`
11. Backend/API/env/docker/nginx/deploy configs remain preserved.
12. Add screenshots/smoke notes to `docs/design/DARK_GOLD_UI_AUDIT.md`.

## Output required from Codex

When finished, report:
- branch/commit;
- changed files;
- preserved protected files;
- routes implemented;
- tests/build commands passed;
- known UI limitations;
- next stage recommendation.

Do not claim backend integration is complete. This is a UI-only rebuild.
