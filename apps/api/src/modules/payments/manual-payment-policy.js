import { AppError } from "../../common/errors.js";

// A driver can acknowledge money received directly from the rider. An
// electronic payment requires the provider confirmation flow; the existing
// OWNER/FINANCE reconciliation path retains its separate operator authority.
export function assertDriverManualPaymentAllowed(actorRole, paymentMethod) {
  if (actorRole === "DRIVER" && !["CASH", "KASPI"].includes(paymentMethod)) {
    throw new AppError(
      "Electronic payment must be confirmed by the payment provider or finance operator",
      403,
      "DRIVER_PAYMENT_CONFIRMATION_FORBIDDEN"
    );
  }
}
