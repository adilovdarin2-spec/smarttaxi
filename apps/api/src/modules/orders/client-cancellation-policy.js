export function isClientCancellationAlreadyApplied(status) {
  return status === "CANCELLED_BY_CLIENT";
}
