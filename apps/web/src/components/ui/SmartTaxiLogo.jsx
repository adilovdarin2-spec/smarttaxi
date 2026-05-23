import React from "react";

export default function SmartTaxiLogo({ className = "", large = false }) {
  return (
    <img
      className={`smarttaxi-logo ${large ? "smarttaxi-logo--large" : ""} ${className}`}
      src="/brand/smarttaxi-icon.svg"
      alt="SmartTaxi"
      loading="eager"
      decoding="async"
    />
  );
}
