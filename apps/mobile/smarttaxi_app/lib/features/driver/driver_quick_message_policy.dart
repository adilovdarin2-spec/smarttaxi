const _beforePickup = {'ON_MY_WAY', 'RUNNING_LATE_2MIN'};
const _atPickup = {'I_ARRIVED', 'PLEASE_COME_OUT'};

/// Keeps pickup communication aligned with the current trip action.
///
/// In particular, the driver must never see a quick-message action labelled
/// "Я приехал" beside the status-changing action with the same label.
Set<String> driverQuickMessageKeysForStatus(String status) {
  if (status == 'DRIVER_FOUND' || status == 'DRIVER_GOING_TO_CLIENT') {
    return _beforePickup;
  }
  if (status == 'DRIVER_ARRIVED' || status == 'WAITING_CLIENT') {
    return _atPickup;
  }
  return const {};
}
