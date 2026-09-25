// A pending operation belongs to the token it started with. Logging out or
// signing in again invalidates its UI callbacks, even for the same account.
export function sessionGuard(token, readToken, isAlive = () => true) {
  return () => Boolean(token) && isAlive() && readToken() === token;
}
