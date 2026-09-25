// What a driver may owe the service before they stop being given work.
//
// This is a money rule, and it was written as a bare number in two different
// places that both have to agree: the driver accepting an order themselves,
// and the owner assigning one to them by hand. Two copies of a limit are two
// limits — raise one and a driver is refused in the app while the owner can
// still hand them a trip, which is the kind of disagreement nobody notices
// until a driver is on the phone about it.
//
// 5000, потому что столько названо в оферте, которую водитель принимает:
// «Максимальный размер задолженности водителя, отражаемой в приложении,
// составляет 5 000 тенге». В коде стояло 15000 — втрое больше обещанного, и
// узнать настоящее число водителю было неоткуда: в приложении лимит нигде не
// показан. Расхождение между подписанным и работающим лечится в пользу
// подписанного.
export const DRIVER_DEBT_CEILING_KZT = 5000;

// The owner's dashboard warns well before the ceiling, so a driver can be
// asked to settle up before they are cut off mid-shift rather than after.
// 3500 — те же две трети от потолка, что и раньше. При комиссии 7 процентов
// это ещё около тридцати поездок по 700 ₸ до отключения: достаточно, чтобы
// успеть попросить рассчитаться.
export const DRIVER_DEBT_WARNING_KZT = 3500;

export function isOverDebtCeiling(debt) {
  return Number(debt) > DRIVER_DEBT_CEILING_KZT;
}
