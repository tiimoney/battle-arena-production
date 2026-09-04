// A plain message paired with a status code, used everywhere a data operation
// (auth, Firestore read/write) needs to signal a friendly, user-facing rejection --
// dialogs catch this and show `.message` directly, distinguishing it from an
// unexpected/unhandled error via `instanceof ApiError`.
export class ApiError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

export function validationError(message: string): ApiError {
  return new ApiError(message, 400);
}

export function forbidden(message = "Only the admin account can change league data."): ApiError {
  return new ApiError(message, 403);
}

export function notFound(message: string): ApiError {
  return new ApiError(message, 404);
}

export function unauthorized(message = "You must be logged in to continue."): ApiError {
  return new ApiError(message, 401);
}
