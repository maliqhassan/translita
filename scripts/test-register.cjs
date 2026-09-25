/**
 * Module hook for the unit tests.
 *
 * The tests exercise the real compiled modules, which means resolving the `@/`
 * alias exactly as Metro does, and standing in for the two native packages the
 * service layer imports. Everything else runs for real.
 */
const path = require('path');
const Module = require('module');

const REPO_ROOT = path.resolve(__dirname, '..');
const BUILD_ROOT = path.join(REPO_ROOT, '.test-build', 'src');
/** `@shared/*` resolves to the repo's shared data, not to build output. */
const SHARED_ROOT = path.join(REPO_ROOT, 'shared');

// `__DEV__` is a Metro global; the logger reads it at module load.
globalThis.__DEV__ = false;

/**
 * Native modules cannot load under Node. These stubs cover only what the code
 * under test touches; anything else would throw loudly rather than pass
 * silently.
 */
const STUBS = {
  'react-native': {
    Platform: { OS: 'android', select: (o) => ('android' in o ? o.android : o.default) },
    StyleSheet: { hairlineWidth: 1, create: (s) => s, absoluteFillObject: {} },
  },
  'expo-network': {
    getNetworkStateAsync: async () => ({ isConnected: true, isInternetReachable: true }),
    addNetworkStateListener: () => ({ remove: () => {} }),
  },
  'expo-clipboard': {
    setStringAsync: async () => true,
    getStringAsync: async () => '',
    hasStringAsync: async () => false,
  },
  /**
   * The native SQLite module cannot load under Node. Tests never use this
   * driver: they build the repository over the Node SQLite driver in
   * `tests/support`, so the SQL under test is still run by a real engine.
   */
  /**
   * The platform speech engine cannot load under Node. TTS tests drive
   * `createExpoTTSService` with an injected fake, so this stub only has to
   * exist for the module-level default binding in the registry.
   */
  /**
   * The platform recogniser cannot load under Node. Recognition tests drive
   * `createExpoSpeechRecognitionService` with an injected fake, so this stub
   * exists only for the module-level default binding in the registry.
   */
  /**
   * The camera cannot open under Node. Scanner tests drive the OCR service
   * with an injected fake; this stub exists for the module-level import in
   * the camera component.
   */
  'expo-camera': {
    CameraView: function CameraView() {
      throw new Error('expo-camera is unavailable under Node.');
    },
    useCameraPermissions: () => [null, async () => ({ granted: false, canAskAgain: true })],
  },
  'expo-speech-recognition': {
    ExpoSpeechRecognitionModule: {
      isRecognitionAvailable: () => false,
      supportsOnDeviceRecognition: () => false,
      getPermissionsAsync: async () => ({ granted: false, canAskAgain: true }),
      requestPermissionsAsync: async () => ({ granted: false, canAskAgain: true }),
      start: () => {
        throw new Error('expo-speech-recognition is unavailable under Node.');
      },
      stop: () => {},
      abort: () => {},
      addListener: () => ({ remove: () => {} }),
    },
  },
  'expo-speech': {
    speak: () => {
      throw new Error('expo-speech is unavailable under Node.');
    },
    stop: async () => {},
    getAvailableVoicesAsync: async () => [],
    isSpeakingAsync: async () => false,
    maxSpeechInputLength: 4000,
  },
  'expo-sqlite': {
    openDatabaseAsync: async () => {
      throw new Error('expo-sqlite is unavailable under Node; use createNodeSQLiteDatabase.');
    },
  },
  /**
   * Preferences tests drive `createPreferencesService` with an in-memory
   * storage slot, so the file-backed implementation is never exercised here.
   */
  /**
   * The ML Kit module is resolved optionally, so under Node it simply is not
   * there — which is exactly the "no native build" case the engine must handle.
   */
  /**
   * RevenueCat's SDK is a native module and cannot load under Node.
   *
   * The service is exercised against an injected `CustomerInfo` shape rather
   * than through this stub, so it only has to satisfy the module-level import
   * and the enum the service reads. Anything else throws rather than quietly
   * answering.
   */
  'react-native-purchases': {
    default: {
      configure: () => {
        throw new Error('react-native-purchases is unavailable under Node.');
      },
      getCustomerInfo: async () => {
        throw new Error('react-native-purchases is unavailable under Node.');
      },
      addCustomerInfoUpdateListener: () => () => {},
      setLogLevel: () => {},
      getOfferings: async () => {
        throw new Error('react-native-purchases is unavailable under Node.');
      },
      purchasePackage: async () => {
        throw new Error('react-native-purchases is unavailable under Node.');
      },
      restorePurchases: async () => {
        throw new Error('react-native-purchases is unavailable under Node.');
      },
    },
    LOG_LEVEL: { DEBUG: 'DEBUG', INFO: 'INFO', WARN: 'WARN', ERROR: 'ERROR' },
    // Read at module scope by the purchase service, so it has to exist even
    // though nothing under Node ever reaches a real package.
    PACKAGE_TYPE: {
      UNKNOWN: 'UNKNOWN',
      CUSTOM: 'CUSTOM',
      LIFETIME: 'LIFETIME',
      ANNUAL: 'ANNUAL',
      SIX_MONTH: 'SIX_MONTH',
      THREE_MONTH: 'THREE_MONTH',
      TWO_MONTH: 'TWO_MONTH',
      MONTHLY: 'MONTHLY',
      WEEKLY: 'WEEKLY',
    },
  },
  'expo-modules-core': {
    requireOptionalNativeModule: () => null,
    requireNativeModule: () => {
      throw new Error('Native modules are unavailable under Node.');
    },
  },
  'expo-file-system': {
    File: class {
      get exists() {
        throw new Error('expo-file-system is unavailable under Node.');
      }
    },
    Directory: class {},
    Paths: { document: {}, cache: {} },
  },
};

for (const [name, exports] of Object.entries(STUBS)) {
  const id = `stub:${name}`;
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (Object.prototype.hasOwnProperty.call(STUBS, request)) return `stub:${request}`;
  if (request.startsWith('@modules/')) {
    return originalResolve.call(
      this,
      path.join(REPO_ROOT, '.test-build', 'modules', request.slice('@modules/'.length)),
      ...rest,
    );
  }
  if (request.startsWith('@shared/')) {
    return originalResolve.call(
      this,
      path.join(SHARED_ROOT, request.slice('@shared/'.length)),
      ...rest,
    );
  }
  if (request.startsWith('@/')) {
    return originalResolve.call(this, path.join(BUILD_ROOT, request.slice(2)), ...rest);
  }
  return originalResolve.call(this, request, ...rest);
};
