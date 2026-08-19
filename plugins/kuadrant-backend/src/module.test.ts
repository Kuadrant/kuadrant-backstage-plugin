// covers resolveCatalogProcessingExtensionPoint()'s fallback logic: main
// export present, main export absent (older catalog-node, alpha present),
// and main package require() throwing outright (alpha still present).
describe('resolveCatalogProcessingExtensionPoint', () => {
  const mainExtensionPoint = { id: 'main-extension-point' };
  const alphaExtensionPoint = { id: 'alpha-extension-point' };

  beforeEach(() => {
    jest.resetModules();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the main export when present', () => {
    jest.doMock('@backstage/plugin-catalog-node', () => ({
      catalogProcessingExtensionPoint: mainExtensionPoint,
    }));
    jest.doMock('@backstage/plugin-catalog-node/alpha', () => ({
      catalogProcessingExtensionPoint: alphaExtensionPoint,
    }));

    const { resolveCatalogProcessingExtensionPoint } = require('./module');
    expect(resolveCatalogProcessingExtensionPoint()).toBe(mainExtensionPoint);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('falls back to alpha when the main export is absent', () => {
    jest.doMock('@backstage/plugin-catalog-node', () => ({}));
    jest.doMock('@backstage/plugin-catalog-node/alpha', () => ({
      catalogProcessingExtensionPoint: alphaExtensionPoint,
    }));

    const { resolveCatalogProcessingExtensionPoint } = require('./module');
    expect(resolveCatalogProcessingExtensionPoint()).toBe(alphaExtensionPoint);
    // property just being absent (old version) isn't the abnormal case.
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('falls back to alpha when requiring the main package throws', () => {
    jest.doMock('@backstage/plugin-catalog-node', () => {
      throw new Error('module not found');
    });
    jest.doMock('@backstage/plugin-catalog-node/alpha', () => ({
      catalogProcessingExtensionPoint: alphaExtensionPoint,
    }));

    const { resolveCatalogProcessingExtensionPoint } = require('./module');
    expect(resolveCatalogProcessingExtensionPoint()).toBe(alphaExtensionPoint);
    expect(console.warn).toHaveBeenCalled();
  });

  it('throws a clear error when neither main nor alpha resolve', () => {
    jest.doMock('@backstage/plugin-catalog-node', () => {
      throw new Error('module not found');
    });
    jest.doMock('@backstage/plugin-catalog-node/alpha', () => {
      throw new Error('module not found');
    });

    // the module's top-level const calls the resolver immediately, so the
    // throw surfaces from require() itself here, not a second call.
    expect(() => require('./module')).toThrow(
      /could not resolve catalogProcessingExtensionPoint/,
    );
  });
});
