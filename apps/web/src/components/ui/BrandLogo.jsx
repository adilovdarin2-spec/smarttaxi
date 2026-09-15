import React from "react";

// The supplied BaiSapar app icon. Keeping this as the single in-product mark
// prevents the previous route-pin logo from leaking back into individual
// screens while the launcher, splash and web chrome stay visually identical.
export default function BrandLogo({ className = "", large = false }) {
  return (
    <img
      className={`brand-logo ${large ? "brand-logo--large" : ""} ${className}`}
      src="/brand/baisapar_icon_512.png"
      alt="BaiSapar"
      loading="eager"
      decoding="async"
    />
  );
}
