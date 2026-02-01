/**
 * Centralized error handling utilities
 */

class ApiError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

const handleAsyncError = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const globalErrorHandler = (err, req, res, next) => {
  let { statusCode, message } = err;

  if (process.env.NODE_ENV === 'development') {
    console.error(err);
  }

  if (!statusCode) {
    statusCode = 500;
    message = 'Internal Server Error';
  }

  // Send error response
  res.status(statusCode).json({
    status: 'error',
    statusCode,
    message,
  });
};

export { ApiError, handleAsyncError, globalErrorHandler };