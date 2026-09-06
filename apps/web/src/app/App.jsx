import React from "react";

// Each product surface owns a large UI tree (and the trip/admin surfaces also
// pull in MapLibre). Loading all of them for the public landing page made the
// first JavaScript response unnecessarily large. The pathname is already the
// route selector, so lazy imports keep the requested surface intact while
// deferring every unrelated one.
const AdminApp = React.lazy(() => import("../features/admin/AdminApp.jsx"));
const ClientApp = React.lazy(() => import("../features/client/ClientApp.jsx"));
const DriverApp = React.lazy(() => import("../features/driver/DriverApp.jsx"));
const LandingPage = React.lazy(() => import("../features/landing/LandingPage.jsx"));
const LegalApp = React.lazy(() => import("../features/legal/LegalApp.jsx"));
const TrackApp = React.lazy(() => import("../features/track/TrackApp.jsx"));

function AppLoading() {
  return <main className="app-loading" role="status" aria-live="polite">Загружаем SmartTaxi…</main>;
}

export default function App() {
  const path = window.location.pathname.toLowerCase();
  let Page = ClientApp;
  // Public, unauthenticated — Google Play / App Store review and the Play
  // Console's "App content" form both require a live privacy policy URL
  // reachable in a plain browser, not just inside the installed app.
  if (path.startsWith("/legal")) Page = LegalApp;
  else if (path.startsWith("/driver")) Page = DriverApp;
  // OPERATOR/FINANCE staff sign into the same unified admin panel as OWNER —
  // AdminApp already accepts all three roles (see `adminRoles` there) and
  // shows the sections each role needs, so the old lightweight /operator
  // app is retired in favor of one app instead of two to keep in sync.
  else if (path.startsWith("/admin") || path.startsWith("/owner") || path.startsWith("/operator")) Page = AdminApp;
  // Public, unauthenticated "поделиться поездкой" link — no login gate.
  else if (path.startsWith("/track/")) Page = TrackApp;
  // Root shows a marketing landing page (like a real taxi service's public
  // site) instead of dropping straight into the booking flow — its own
  // "Заказать поездку" buttons send the visitor to /order. Every other path
  // (including /order itself) keeps falling through to ClientApp as before,
  // so existing bookmarks/deep-links into the booking flow don't break.
  else if (path === "/" || path === "") Page = LandingPage;
  return <React.Suspense fallback={<AppLoading />}><Page /></React.Suspense>;
}
