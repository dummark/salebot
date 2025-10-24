const levelPriority = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const activeThreshold = levelPriority[LOG_LEVEL] ?? levelPriority.info;

function formatMessage(level, message, args) {
  const timestamp = new Date().toISOString();
  const base = `${timestamp} [${level}] ${message}`;
  if (!args.length) {
    return base;
  }
  return `${base} ${args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ')}`;
}

function log(level, message, ...args) {
  if ((levelPriority[level] ?? Number.POSITIVE_INFINITY) > activeThreshold) {
    return;
  }

  const formatted = formatMessage(level, message, args);

  if (level === 'error') {
    console.error(formatted);
  } else if (level === 'warn') {
    console.warn(formatted);
  } else {
    console.log(formatted);
  }
}

module.exports = {
  info: (message, ...args) => log('info', message, ...args),
  warn: (message, ...args) => log('warn', message, ...args),
  error: (message, ...args) => log('error', message, ...args),
  debug: (message, ...args) => log('debug', message, ...args)
};
