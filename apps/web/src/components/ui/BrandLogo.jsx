import React from "react";

// The BaiSapar mark — a route from an open origin ring to a gold destination
// point. Same artwork as the app launcher icon.
export default function BrandLogo({ className = "", large = false }) {
  return (
    <img
      className={`brand-logo ${large ? "brand-logo--large" : ""} ${className}`}
      src="/brand/baisapar_icon.svg"
      alt="BaiSapar"
      loading="eager"
      decoding="async"
    />
  );
}
