// What a driver may owe the service before they stop being given work.
//
// This is a money rule, and it was written as a bare 15000 in two different
// places that both have to agree: the driver accepting an order themselves,
// and the owner assigning one to them by hand. Two copies of a limit are two
// limits — raise one and a driver is refused in the app while the owner can
// still hand them a trip, which is the kind of disagreement nobody notices
// until a driver is on the phone about it.
export const DRIVER_DEBT_CEILING_KZT = 15000;

// The owner's dashboard warns well before the ceiling, so a driver can be
// asked to settle up before they are cut off mid-shift rather than after.
export const DRIVER_DEBT_WARNING_KZT = 10000;

export function isOverDebtCeiling(debt) {
  return Number(debt) > DRIVER_DEBT_CEILING_KZT;
}
