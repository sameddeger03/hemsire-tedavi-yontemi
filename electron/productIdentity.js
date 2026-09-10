module.exports = Object.freeze({
  USER_DATA_DIRECTORY: 'HemsireTedaviYonetimi',
  DATABASE_FILENAME: 'tedavi.db',
  BACKUP_FILENAME_PREFIX: 'tedavi-',
  BACKUP_FILENAME_PATTERN: /^tedavi-.*\.db$/,
  ENCRYPTED_DATABASE_HEADER: Buffer.from('TEDAVIENC1\n'),
  LOG_PREFIX: 'TEDAVI',
  REPORT_TEMP_DIRECTORY: 'tedavi-reports'
})
