const logger = require('../config/logger');

const errorHandler = (err, req, res, next) => {
  logger.error(err.message, { stack: err.stack, path: req.path, method: req.method });

  if (err.code === '23505') {
    return res.status(409).json({ success: false, message: 'Record already exists' });
  }
  if (err.code === '23503') {
    return res.status(400).json({ success: false, message: 'Referenced record not found' });
  }

  const status = err.status || 500;
  res.status(status).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
};

module.exports = { errorHandler };
