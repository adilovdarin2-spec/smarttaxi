import React from "react";

const paths = {
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  back: <path d="m15 18-6-6 6-6" />,
  chevron: <path d="m9 18 6-6-6-6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  search: <path d="m21 21-4.3-4.3M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z" />,
  home: <path d="M4 11.2 12 5l8 6.2V20h-5v-5H9v5H4Z" />,
  work: <path d="M9 7V5h6v2m-9 3h12v9H6Zm7 3h-2" />,
  star: <path d="m12 4 2.4 5 5.6.8-4 3.9.9 5.5-4.9-2.7-4.9 2.7.9-5.5-4-3.9 5.6-.8Z" />,
  heart: <path d="M20.5 8.7c0 5.1-8.5 10.3-8.5 10.3S3.5 13.8 3.5 8.7A4.6 4.6 0 0 1 12 6.2a4.6 4.6 0 0 1 8.5 2.5Z" />,
  clock: <path d="M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
  history: <path d="M3 12a9 9 0 1 0 3-6.7M3 5v5h5M12 7v5l3 2" />,
  pin: <><path d="M12 21s7-5.2 7-11a7 7 0 0 0-14 0c0 5.8 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" /></>,
  route: <path d="M6 18c3 0 3-12 6-12s3 12 6 12M6 18h.01M18 18h.01" />,
  cash: <path d="M4 7h16v10H4Zm4 5h.01M16 12h.01M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />,
  card: <path d="M4 7h16v10H4Zm0 3h16" />,
  user: <path d="M20 20a8 8 0 0 0-16 0m12-11a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" />,
  ticket: <><path d="M5 6h14v4a2 2 0 0 0 0 4v4H5v-4a2 2 0 0 0 0-4Z" /><path d="M9 9.5h.01M15 14.5h.01M15.5 8.5l-7 7" /></>,
  gift: <path d="M4 10h16v10H4Zm0 0h16M12 10v10M8 10c-2.3 0-2.5-4 0-4 1.5 0 2.5 2 4 4 1.5-2 2.5-4 4-4 2.5 0 2.3 4 0 4" />,
  support: <path d="M5 13a7 7 0 0 1 14 0v4a2 2 0 0 1-2 2h-2v-6h4M5 13v4a2 2 0 0 0 2 2h2v-6H5" />,
  bell: <><path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" /><path d="M10 21h4" /></>,
  shield: <path d="M12 3 5 6v5c0 4.5 2.8 8 7 10 4.2-2 7-5.5 7-10V6Z" />,
  lock: <><path d="M7 11V8a5 5 0 0 1 10 0v3" /><path d="M6 11h12v9H6Z" /></>,
  document: <><path d="M7 3h7l4 4v14H7Z" /><path d="M14 3v5h5M10 12h5M10 16h6" /></>,
  chat: <path d="M4 5h16v11H8l-4 4Z" />,
  settings: <><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" /><path d="M19 12a7.7 7.7 0 0 0-.1-1.1l2-1.5-2-3.4-2.4 1a7.2 7.2 0 0 0-1.9-1.1L14.3 3h-4.6l-.3 2.9A7.2 7.2 0 0 0 7.5 7l-2.4-1-2 3.4 2 1.5A7.7 7.7 0 0 0 5 12c0 .4 0 .8.1 1.1l-2 1.5 2 3.4 2.4-1c.6.5 1.2.8 1.9 1.1l.3 2.9h4.6l.3-2.9c.7-.3 1.3-.6 1.9-1.1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1.1Z" /></>,
  logout: <path d="M10 17 5 12l5-5M5 12h12M14 4h5v16h-5" />,
  phone: <path d="M8 4 5 7c0 6.6 5.4 12 12 12l3-3-4-4-2 2c-2-.8-3.2-2-4-4l2-2Z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="m5 12 4 4L19 6" />,
  filter: <path d="M4 6h16M7 12h10M10 18h4" />,
  expand: <path d="M8 4H4v4M4 4l6 6M16 4h4v4M20 4l-6 6M8 20H4v-4M4 20l6-6M16 20h4v-4M20 20l-6-6" />,
  admin: <path d="M4 20V8l8-4 8 4v12M8 20v-8h8v8" />,
  operator: <path d="M4 14a8 8 0 1 1 16 0v3a3 3 0 0 1-3 3h-3m-6-6v3H5a1 1 0 0 1-1-1v-2Zm12 0v3h3a1 1 0 0 0 1-1v-2Z" />
};

export function Icon({ name, size = 20 }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name] || paths.pin}
    </svg>
  );
}

export function VehicleIcon({ type = "sedan" }) {
  const isVan = type === "van" || type === "Delivery";
  return (
    <svg className="vehicle-icon" viewBox="0 0 88 36" fill="none" aria-hidden="true">
      <path d={isVan ? "M12 20h8l5-9h27l11 9h10v7H12Z" : "M9 21h9l8-10h29l10 10h13v6H9Z"} fill="currentColor" />
      <path d="M27 14h15M47 14h9" stroke="#fff" strokeOpacity=".55" strokeWidth="3" strokeLinecap="round" />
      <circle cx="27" cy="28" r="6" fill="#111827" />
      <circle cx="66" cy="28" r="6" fill="#111827" />
    </svg>
  );
}
