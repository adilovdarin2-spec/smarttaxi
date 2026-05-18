import React from "react";
import AdminApp from "../features/admin/AdminApp.jsx";
import ClientApp from "../features/client/ClientApp.jsx";
import DriverApp from "../features/driver/DriverApp.jsx";
import OperatorApp from "../features/operator/OperatorApp.jsx";

export default function App() {
  const path = window.location.pathname.toLowerCase();
  if (path.startsWith("/driver")) return <DriverApp />;
  if (path.startsWith("/operator")) return <OperatorApp />;
  if (path.startsWith("/admin") || path.startsWith("/owner")) return <AdminApp />;
  return <ClientApp />;
}
