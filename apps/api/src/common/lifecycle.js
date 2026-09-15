let shuttingDown = false;

export function beginShutdown() {
  if (shuttingDown) return false;
  shuttingDown = true;
  return true;
}

export function isShuttingDown() {
  return shuttingDown;
}
