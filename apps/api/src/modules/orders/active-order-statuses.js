// Shared by dispatch and stand admission without a service import cycle.
// Older source statuses remain active until their trip is explicitly closed.
export const ACTIVE_ORDER_STATUSES = [
  'DRIVER_FOUND',
  'DRIVER_GOING_TO_CLIENT',
  'DRIVER_ARRIVED',
  'WAITING_CLIENT',
  'TRIP_STARTED',
  'DRIVER_ASSIGNED',
  'IN_PROGRESS',
];
