export const EMPTY_RIDER = Object.freeze({ name: "Пассажир", phone: "" });

export function clientIdentity(user, fallbackPhone = "") {
  if (user?.role !== "CLIENT") return null;
  return {
    name: [user.name, user.surname].filter(Boolean).join(" ") || user.login || "Пассажир",
    phone: user.phone || fallbackPhone,
    baseRole: user.baseRole || user.role,
  };
}
