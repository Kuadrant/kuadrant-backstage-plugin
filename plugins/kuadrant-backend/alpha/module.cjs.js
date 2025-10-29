'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var backendPluginApi = require('@backstage/backend-plugin-api');
var alpha = require('@backstage/plugin-catalog-node/alpha');
var APIProductEntityProvider = require('./providers/APIProductEntityProvider.cjs.js');

const catalogModuleApiProductEntityProvider = backendPluginApi.createBackendModule({
  pluginId: "catalog",
  moduleId: "kuadrant-apiproduct-provider",
  register(env) {
    env.registerInit({
      deps: {
        catalog: alpha.catalogProcessingExtensionPoint,
        config: backendPluginApi.coreServices.rootConfig,
        logger: backendPluginApi.coreServices.logger
      },
      async init({ catalog, config, logger }) {
        logger.info("registering kuadrant apiproduct entity provider");
        const provider = new APIProductEntityProvider.APIProductEntityProvider(config);
        catalog.addEntityProvider(provider);
        logger.info("apiproduct entity provider registered successfully");
      }
    });
  }
});

exports.catalogModuleApiProductEntityProvider = catalogModuleApiProductEntityProvider;
exports.default = catalogModuleApiProductEntityProvider;
//# sourceMappingURL=module.cjs.js.map
