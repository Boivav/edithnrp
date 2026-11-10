function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ message: status === 500 ? 'Internal server error' : err.message, ...(process.env.NODE_ENV !== 'production' && status === 500 ? { detail: err.message } : {}) });
}
module.exports = errorHandler;
