// Port of the Flutter app's LeagueValidationException / AuthFlowException: a plain
// message paired with the HTTP status the route layer should respond with.
export class AppError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
    this.name = "AppError";
  }
}

export function validationError(message: string): AppError {
  return new AppError(message, 400);
}

export function forbidden(message = "Only the admin account can change league data."): AppError {
  return new AppError(message, 403);
}

export function notFound(message: string): AppError {
  return new AppError(message, 404);
}

export function unauthorized(message = "You must be logged in to continue."): AppError {
  return new AppError(message, 401);
}
