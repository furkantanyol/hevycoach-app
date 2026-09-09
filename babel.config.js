// `inline-import` inlines the generated `drizzle/*.sql` migrations into the bundle, which is how
// Drizzle ships migrations to Expo. https://orm.drizzle.team/docs/get-started/expo-new
module.exports = function babelConfig(api) {
  api.cache(true);

  return {
    presets: ['babel-preset-expo'],
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
