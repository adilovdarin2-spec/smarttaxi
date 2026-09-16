// A seat write is never replayed. Read back the authoritative queue after
// either success or a lost acknowledgement before enabling another write.
// Polls started before a write cannot overwrite its reconciliation snapshot.
export class StandSync {
  constructor(readContext = () => null) {
    this.readContext = readContext;
    this.active = true;
    this.epoch = 0;
    this.sequence = 0;
    this.blocked = true;
    this.write = null;
  }
  activate() { this.active = true; this.epoch++; this.blocked = true; this.write = null; }
  dispose() { this.active = false; this.epoch++; this.write = null; }
  current(ticket) {
    return Boolean(ticket && this.active && ticket.epoch === this.epoch &&
      ticket.context === this.readContext());
  }
  beginRead({ reconcile = false } = {}) {
    if (!this.active || (this.write && !reconcile)) return null;
    return { epoch: this.epoch, context: this.readContext(), sequence: ++this.sequence };
  }
  currentRead(ticket) { return this.current(ticket) && ticket.sequence === this.sequence; }
  settleRead(ticket, success) {
    if (!this.currentRead(ticket)) return false;
    this.blocked = !success;
    return true;
  }
  beginWrite() {
    if (!this.active || this.blocked || this.write) return null;
    this.sequence++;
    this.blocked = true;
    this.write = { epoch: this.epoch, context: this.readContext() };
    return this.write;
  }
  currentWrite(ticket) { return this.current(ticket) && this.write === ticket; }
  finishWrite(ticket) {
    if (!this.currentWrite(ticket)) return false;
    this.write = null;
    return true;
  }
}
