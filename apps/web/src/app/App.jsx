import React from "react";
import AdminApp from "../features/admin/AdminApp.jsx";
import ClientApp from "../features/client/ClientApp.jsx";
import DriverApp from "../features/driver/DriverApp.jsx";
import LandingPage from "../features/landing/LandingPage.jsx";
import LegalApp from "../features/legal/LegalApp.jsx";
import TrackApp from "../features/track/TrackApp.jsx";

export default function App() {
  const path = window.location.pathname.toLowerCase();
  // Public, unauthenticated — Google Play / App Store review and the Play
  // Console's "App content" form both require a live privacy policy URL
  // reachable in a plain browser, not just inside the installed app.
  if (path.startsWith("/legal")) return <LegalApp />;
  if (path.startsWith("/driver")) return <DriverApp />;
  // OPERATOR/FINANCE staff sign into the same unified admin panel as OWNER —
  // AdminApp already accepts all three roles (see `adminRoles` there) and
  // shows the sections each role needs, so the old lightweight /operator
  // app is retired in favor of one app instead of two to keep in sync.
  if (path.startsWith("/admin") || path.startsWith("/owner") || path.startsWith("/operator")) {
    return <AdminApp />;
  }
  // Public, unauthenticated "поделиться поездкой" link — no login gate.
  if (path.startsWith("/track/")) return <TrackApp />;
  // Root shows a marketing landing page (like a real taxi service's public
  // site) instead of dropping straight into the booking flow — its own
  // "Заказать поездку" buttons send the visitor to /order. Every other path
  // (including /order itself) keeps falling through to ClientApp as before,
  // so existing bookmarks/deep-links into the booking flow don't break.
  if (path === "/" || path === "") return <LandingPage />;
  return <ClientApp />;
}
