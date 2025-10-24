const { createLogger, format, transports } = require('winston');

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.splat(),
    format.printf((info) => `${info.timestamp} [${info.level}] ${info.message}${info.stack ? `\n${info.stack}` : ''}`)
  ),
  transports: [
    new transports.Console()
  ]
});

module.exports = logger;
