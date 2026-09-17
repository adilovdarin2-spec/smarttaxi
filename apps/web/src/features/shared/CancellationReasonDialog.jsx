import React, { useEffect, useRef, useState } from "react";
import {
  CLIENT_CANCEL_NOTICE,
  CLIENT_CANCEL_REASONS,
  DRIVER_CANCEL_NOTICE,
  DRIVER_CANCEL_REASONS,
} from "./cancellationReasons.js";

/// Asks why the trip is being cancelled, and refuses to cancel until it has an
/// answer — an unexplained cancellation after the car arrived is exactly the
/// case this exists to make visible. Backing out keeps the trip.
export default function CancellationReasonDialog({ open, isDriver, busy, onCancel, onConfirm }) {
  const [selected, setSelected] = useState("");
  const [note, setNote] = useState("");
  const dialogRef = useRef(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (!open) return;
    setSelected("");
    setNote("");
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    dialog?.querySelector("input, button")?.focus();
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancelRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...dialog.querySelectorAll("button:not(:disabled), input:not(:disabled)")];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    dialog?.addEventListener("keydown", handleKeyDown);
    return () => {
      dialog?.removeEventListener("keydown", handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);

  if (!open) return null;

  const reasons = isDriver ? DRIVER_CANCEL_REASONS : CLIENT_CANCEL_REASONS;
  const notice = isDriver ? DRIVER_CANCEL_NOTICE : CLIENT_CANCEL_NOTICE;

  return (
    <div className="cancel-reason-backdrop" role="presentation">
      <div
        className="cancel-reason-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={isDriver ? "Почему отменяете поездку?" : "Почему отменяете?"}
        ref={dialogRef}
      >
        <h2>{isDriver ? "Почему отменяете поездку?" : "Почему отменяете?"}</h2>
        <p className="cancel-reason-notice">{notice}</p>
        <div className="cancel-reason-options">
          {reasons.map(reason => (
            <label key={reason.code} className={selected === reason.code ? "selected" : ""}>
              <input
                type="radio"
                name="cancel-reason"
                value={reason.code}
                checked={selected === reason.code}
                onChange={() => setSelected(reason.code)}
              />
              <span>{reason.label}</span>
            </label>
          ))}
        </div>
        <label className="cancel-reason-note">
          <span>Что произошло (необязательно)</span>
          <input
            type="text"
            maxLength={300}
            value={note}
            onChange={event => setNote(event.target.value)}
          />
        </label>
        <div className="cancel-reason-actions">
          <button type="button" className="cancel-reason-keep" onClick={onCancel} disabled={busy}>
            Не отменять
          </button>
          <button
            type="button"
            className="cancel-reason-submit"
            // Without a reason there is nothing to record, so the button waits.
            disabled={!selected || busy}
            onClick={() => onConfirm({ reasonCode: selected, reasonNote: note.trim() })}
          >
            {busy ? "Отменяем…" : "Отменить поездку"}
          </button>
        </div>
      </div>
    </div>
  );
}
