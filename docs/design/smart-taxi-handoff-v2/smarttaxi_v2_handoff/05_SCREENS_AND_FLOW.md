# SmartTaxi V2 — Screen List and Flow

## Client Screens
1. Login
2. Register Client
3. Passenger Home
4. Select Pickup
5. Select Destination
6. Select Tariff
7. Select Payment
8. Searching Driver
9. Driver Assigned
10. Driver Arriving
11. Ride In Progress
12. Complete Ride
13. Rate Ride
14. Receipt
15. History
16. Client Menu/Profile
17. Payment Methods
18. Promo Codes
19. Bonuses
20. Invite Friend
21. Support Chat
22. Notifications
23. Favorite Addresses
24. Settings

## Driver Screens
1. Driver Login
2. Driver Register
3. Document Verification
4. Driver Home
5. Online/Offline Toggle
6. New Order
7. Order Details
8. Navigation to Passenger
9. Passenger Picked Up
10. Ride In Progress
11. Complete Ride
12. Earnings
13. Balance
14. Withdrawal
15. Driver History
16. Driver Menu
17. Driver Support
18. Driver Settings

## Operator Screens
1. Operator Dashboard
2. Ticket List
3. Ticket Details
4. Chat with Client
5. Chat with Driver
6. Manual Driver Assignment
7. Payment Problems
8. Complaints
9. Search Order
10. Closed Tickets

## Admin Screens
1. Admin Dashboard
2. Users
3. Drivers
4. Driver Verification
5. Trips
6. Finance
7. Tariffs
8. Commissions
9. Promo Codes
10. Support
11. Cities/Zones
12. Driver Activity Map
13. Analytics
14. Blocked Users
15. Settings
16. Audit Logs

## Ride State Flow
draft → priced → searching → assigned → driver_arriving → arrived → in_trip → completed

Cancel states:
- cancelled_by_client
- cancelled_by_driver
- cancelled_by_operator
