// middleware/validator.js
const { body, param, validationResult } = require('express-validator');

/**
 * Request validation middleware
 * Prevents invalid data from reaching business logic
 */

/**
 * Handle validation errors
 */
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            status: 'error',
            errors: errors.array().map(err => ({
                field: err.path,
                message: err.msg
            }))
        });
    }
    next();
};

/**
 * Validation rules for status updates
 */
const validateStatusUpdate = [
    body('*.status')
        .optional()
        .isIn(['Active', 'Inactive'])
        .withMessage('Status must be either Active or Inactive'),
    body('*.threshold')
        .optional()
        .isInt({ min: 1, max: 10000 })
        .withMessage('Threshold must be between 1 and 10000'),
    handleValidationErrors
];

/**
 * Validation rules for queue name parameter
 */
const validateQueueName = [
    param('name')
        .trim()
        .matches(/^GPON[a-zA-Z0-9-_]+$/)
        .withMessage('Invalid queue name format'),
    handleValidationErrors
];

/**
 * Sanitize object to prevent injection
 */
const sanitizeObject = obj => {
    if (typeof obj !== 'object' || obj === null) {
        return obj;
    }

    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
        // Remove potentially dangerous characters
        const cleanKey = key.replace(/[^\w-]/g, '');
        sanitized[cleanKey] = typeof value === 'string' 
            ? value.trim() 
            : value;
    }
    return sanitized;
};

module.exports = {
    validateStatusUpdate,
    validateQueueName,
    handleValidationErrors,
    sanitizeObject
};
