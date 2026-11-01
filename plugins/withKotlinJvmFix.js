const { withGradleProperties } = require('expo/config-plugins');

module.exports = function withKotlinJvmFix(config) {
  return withGradleProperties(config, (cfg) => {
    // Ensure the fix isn't duplicated if the plugin runs multiple times
    cfg.modResults = cfg.modResults.filter(
      (item) => !(item.type === 'property' && item.key === 'kotlin.jvm.target.validation.mode')
    );
    // Add the property
    cfg.modResults.push({
      type: 'property',
      key: 'kotlin.jvm.target.validation.mode',
      value: 'IGNORE',
    });
    return cfg;
  });
};