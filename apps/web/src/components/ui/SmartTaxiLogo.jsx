import React from "react";

export default function SmartTaxiLogo({ className = "", large = false }) {
  return (
    <img
      className={`smarttaxi-logo ${large ? "smarttaxi-logo--large" : ""} ${className}`}
      src="/brand/smarttaxi_app_icon_2026.png"
      alt="SmartTaxi"
      loading="eager"
      decoding="async"
    />
  );
}
