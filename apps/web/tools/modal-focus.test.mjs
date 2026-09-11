import assert from "node:assert/strict";
import test from "node:test";
import { containModalFocus } from "../src/lib/modalFocus.js";

function fixture() {
  const listeners = new Map();
  const doc = {
    addEventListener: (key, fn) => listeners.set(key, fn),
    removeEventListener: (key, fn) => {
      if (listeners.get(key) === fn) listeners.delete(key);
    },
  };
  const element = (name, visible = true, inert = false) => ({
    name,
    isConnected: true,
    getClientRects: () => (visible ? [{}] : []),
    closest: () => (inert ? {} : null),
    focus() {
      doc.activeElement = this;
    },
  });
  const opener = element("open"),
    first = element("close"),
    last = element("last");
  const targets = [
    first,
    element("hidden", false),
    element("inert", true, true),
    last,
  ];
  const root = {
    ...element("root"),
    querySelectorAll: () => targets,
    contains: (node) => node === root || targets.includes(node),
  };
  doc.activeElement = opener;
  const key = (key, shiftKey = false) => {
    const event = {
      key,
      shiftKey,
      prevented: false,
      preventDefault() {
        this.prevented = true;
      },
    };
    listeners.get("keydown")?.(event);
    return event;
  };
  return { doc, listeners, opener, first, last, root, targets, key };
}

test("modal focuses visible controls, wraps Tab, closes with Escape and restores opener", () => {
  const f = fixture();
  let closed = 0;
  const dispose = containModalFocus(f.root, () => closed++, f.doc);
  assert.equal(f.doc.activeElement, f.first);
  assert.equal(f.key("Tab", true).prevented, true);
  assert.equal(f.doc.activeElement, f.last);
  assert.equal(f.key("Tab").prevented, true);
  assert.equal(f.doc.activeElement, f.first);
  assert.equal(f.key("Tab").prevented, false);
  f.opener.focus();
  f.listeners.get("focusin")({ target: f.opener });
  assert.equal(f.doc.activeElement, f.first);
  assert.equal(f.key("Escape").prevented, true);
  assert.equal(closed, 1);
  dispose();
  assert.equal(f.listeners.size, 0);
  assert.equal(f.doc.activeElement, f.opener);
});

test("an empty modal retains focus; a removed opener is never restored", () => {
  const f = fixture();
  f.targets.length = 0;
  const dispose = containModalFocus(f.root, () => {}, f.doc);
  assert.equal(f.doc.activeElement, f.root);
  assert.equal(f.key("Tab").prevented, true);
  f.opener.isConnected = false;
  dispose();
  assert.equal(f.doc.activeElement, f.root);
});
