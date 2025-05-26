// app/utils/logger.js

const LOG_LEVELS = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  DEBUG: 'DEBUG'
};

const LOG_PREFIXES = {
  [LOG_LEVELS.ERROR]: '❌',
  [LOG_LEVELS.WARN]: '⚠️',
  [LOG_LEVELS.INFO]: 'ℹ️',
  [LOG_LEVELS.DEBUG]: '🔍'
};

function formatLogMessage(level, contractID, message) {
  const prefix = LOG_PREFIXES[level];
  return contractID 
    ? `${prefix} [${level}] [${contractID}] ${message}`
    : `${prefix} [${level}] ${message}`;
}

export const logger = {
  error: (message, contractID = null) => {
    console.error(formatLogMessage(LOG_LEVELS.ERROR, contractID, message));
  },

  warn: (message, contractID = null) => {
    console.warn(formatLogMessage(LOG_LEVELS.WARN, contractID, message));
  },

  info: (message, contractID = null) => {
    console.info(formatLogMessage(LOG_LEVELS.INFO, contractID, message));
  },

  debug: (message, contractID = null) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(formatLogMessage(LOG_LEVELS.DEBUG, contractID, message));
    }
  }
}; 