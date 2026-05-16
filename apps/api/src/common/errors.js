export class AppError extends Error {
  constructor(message, status = 400, code = "BAD_REQUEST") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function errorHandler(err, req, res, _next) {
  console.error("[ERROR]", err);
  if (err.name === "ZodError") return res.status(400).json({ error: "VALIDATION_ERROR", details: err.errors });
  res.status(err.status || 500).json({ error: err.code || "INTERNAL_ERROR", message: err.status ? err.message : "Internal server error" });
}
