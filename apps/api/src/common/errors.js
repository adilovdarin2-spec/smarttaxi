export class AppError extends Error {
  constructor(message, status = 400, code = "BAD_REQUEST", details = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function errorHandler(err, req, res, _next) {
  if (err.name === "ZodError") {
    return res.status(400).json({
      error: "VALIDATION_ERROR",
      message: "Invalid request payload",
      details: err.errors
    });
  }

  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "INVALID_JSON", message: "Request body must be valid JSON" });
  }

  if (err.message === "CORS origin is not allowed") {
    return res.status(403).json({ error: "FORBIDDEN", message: "Origin is not allowed" });
  }

  const status = err.status || 500;
  if (status >= 500) console.error("[ERROR]", err);

  res.status(status).json({
    error: err.code || "INTERNAL_ERROR",
    message: err.status ? err.message : "Internal server error",
    ...(err.details ? { details: err.details } : {})
  });
}

export function notFound(req, _res, next) {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404, "ROUTE_NOT_FOUND"));
}
