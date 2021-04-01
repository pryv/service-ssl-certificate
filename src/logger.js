const winston = require('winston');

function getLogger (label = 'default') {
  return winston.createLogger({
    level: 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.label({ label: label }),
      myFormat,
    ),
    transports: [
      new winston.transports.Console()
    ]
  });
}

const myFormat = winston.format.printf(({ level, message, label, timestamp }) => {
  return `${timestamp} [${label}] ${level}: ${message}`;
});

module.exports.getLogger = getLogger;