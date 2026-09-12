import logger from './logger.js';

/**
 * Centralized error handling utilities
 */

class ApiError extends Error {
    constructor(message, statusCode = 500, details = null) {
        super(message);
        this.statusCode = statusCode;
        this.details = details;
        this.isOperational = true;

        Error.captureStackTrace(this, this.constructor);
    }
}

const handleAsyncError = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

const globalErrorHandler = (err, req, res, _next) => {
    let { statusCode, message } = err;

    if (!statusCode || typeof statusCode !== 'number') {
        statusCode = 500;
        message = process.env.NODE_ENV === 'production' 
            ? 'An internal server error occurred' 
            : (err.message || 'Internal Server Error');
    }

    const correlationId = req?.correlationId || req?.headers?.['x-correlation-id'] || 'unknown';

    if (statusCode >= 500) {
        logger.error('Unhandled server error', {
            statusCode,
            message: err.message,
            stack: err.stack,
            method: req?.method,
            path: req?.originalUrl,
            correlationId,
        });
    } else {
        logger.warn('Operational API error', {
            statusCode,
            message,
            method: req?.method,
            path: req?.originalUrl,
            correlationId,
        });
    }

    // Standardized enterprise error envelope
    res.status(statusCode).json({
        status: 'error',
        statusCode,
        message,
        correlationId,
        ...(process.env.NODE_ENV === 'development' && err.details ? { details: err.details } : {}),
        ...(process.env.NODE_ENV === 'development' && err.stack ? { stack: err.stack } : {}),
    });
};

export { ApiError, handleAsyncError, globalErrorHandler };