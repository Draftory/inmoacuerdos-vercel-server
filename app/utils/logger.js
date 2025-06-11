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

// Función para truncar mensajes largos
function truncateMessage(message, maxLength = 50) {
  if (message.length <= maxLength) return message;
  return message.substring(0, maxLength) + '...';
}

// Función para sanitizar datos sensibles
function sanitizeData(data) {
  if (typeof data === 'string') {
    // Eliminar URLs completas
    data = data.replace(/https?:\/\/[^\s]+/g, '[URL]');
    // Eliminar emails
    data = data.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');
    // Eliminar tokens y IDs largos
    data = data.replace(/[a-zA-Z0-9]{32,}/g, '[ID]');
  }
  return data;
}

function formatLogMessage(level, contractID, message) {
  const prefix = LOG_PREFIXES[level];
  const timestamp = new Date().toISOString();
  const contractInfo = contractID ? `[ContractID: ${contractID}]` : '';
  return `${prefix} ${timestamp} ${contractInfo} ${message}`;
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