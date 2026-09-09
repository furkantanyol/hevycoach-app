const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);

// Drizzle's generated migrations are imported as `.sql` modules.
config.resolver.sourceExts.push('sql');

module.exports = config;
