import { join } from 'path';
import { mkdirSync } from 'fs';
import OpenWrt from './src/openwrt.js';
import Router from './src/router.js';
import ImpulseGenerator from './src/impulsegenerator.js';
import { PluginName, PlatformName } from './src/constants.js';

class OpenWrtPlatform {
  constructor(log, config, api) {
    if (!config || !Array.isArray(config.devices)) {
      log.warn(`No configuration found for ${PluginName}`);
      return;
    }

    this.accessories = [];

    const prefDir = join(api.user.storagePath(), 'openWrt');
    try {
      mkdirSync(prefDir, { recursive: true });
    } catch (error) {
      log.error(`Prepare directory error: ${error.message ?? error}`);
      return;
    }

    api.on('didFinishLaunching', () => {
      // Each device is set up independently — a failure in one does not
      // block the others. Promise.allSettled runs all in parallel.
      Promise.allSettled(
        config.devices.map(device =>
          this.setupDevice(device, prefDir, log, api)
        )
      ).then(results => {
        results.forEach((result, i) => {
          if (result.status === 'rejected') {
            log.error(`Device[${i}] setup error: ${result.reason?.message ?? result.reason}`);
          }
        });
      });
    });
  }

  // ── Per-device setup ──────────────────────────────────────────────────────

  async setupDevice(device, prefDir, log, api) {
    const { name, host, displayType } = device;

    if (!name || !host || !displayType) {
      const reason = !name ? 'name missing'
        : !host ? 'host missing'
          : 'display type disabled';
      log.warn(`Device ${host ?? '(no host)'} ${name ?? '(unnamed)'}: ${reason} — will not be published in the Home app`);
      return;
    }

    const refreshInterval = (device.refreshInterval ?? 5) * 1000;

    const logLevel = {
      devInfo: device.log?.deviceInfo,
      success: device.log?.success,
      info: device.log?.info,
      warn: device.log?.warn,
      error: device.log?.error,
      debug: device.log?.debug,
    };

    if (logLevel.debug) {
      log.info(`Device: ${host} ${name}, did finish launching`);
      const safeConfig = {
        ...device,
        auth: {
          ...device.auth,
          passwd: 'removed',
        },
        mqtt: {
          auth: {
            ...device.mqtt?.auth,
            passwd: 'removed',
          },
        },
      };
      log.info(`Device: ${host} ${name}, config: ${JSON.stringify(safeConfig, null, 2)}`);
    }

    // The startup impulse generator retries the full connect cycle
    // every 120 s until it succeeds, then hands off to the openWrt class
    // impulse generator and stops itself.
    const impulseGenerator = new ImpulseGenerator()
      .on('start', async () => {
        try {
          await this.startDevice(
            device, name, host,
            refreshInterval, logLevel,
            log, api, impulseGenerator
          );
        } catch (error) {
          if (logLevel.error) log.error(`Device: ${host} ${name}, Start impulse generator error: ${error.message ?? error}, trying again.`);
        }
      })
      .on('state', (state) => {
        if (logLevel.debug) log.info(`Device: ${host} ${name}, Start impulse generator ${state ? 'started' : 'stopped'}.`);
      });

    await impulseGenerator.state(true, [{ name: 'start', sampling: 120_000 }]);
  }

  // ── Connect and register accessory for one device ─────────────────────────

  async startDevice(device, name, host, refreshInterval, logLevel, log, api, impulseGenerator) {
    const openWrt = new OpenWrt(device)
      .on('success', (msg) => logLevel.success && log.success(`Device: ${host}, ${msg}`))
      .on('info', (msg) => log.info(`Device: ${host} ${name}, ${msg}`))
      .on('debug', (msg) => log.info(`Device: ${host} ${name}, debug: ${msg}`))
      .on('warn', (msg) => log.warn(`Device: ${host} ${name}, ${msg}`))
      .on('error', (msg) => log.error(`Device: ${host} ${name}, ${msg}`));

    // Connect
    const openWrtInfo = await openWrt.connect();
    if (!openWrtInfo.state) {
      if (logLevel.warn) log.warn(`Device: ${host} ${name}, ${openWrtInfo.info}`);
      return;
    }
    if (logLevel.success) log.success(`Device: ${host} ${name}, ${openWrtInfo.info}`);

    // Register accessory
    await this.registerDevice({ device, name, host, openWrt, openWrtInfo, refreshInterval, logLevel, log, api, impulseGenerator });
  }

  // ── Register a single device as a Homebridge accessory ───────────────────

  async registerDevice({ device, name, host, openWrt, openWrtInfo, refreshInterval, logLevel, log, api, impulseGenerator }) {
    const router = new Router(api, device, openWrt, openWrtInfo)
      .on('devInfo', (msg) => logLevel.devInfo && log.info(msg))
      .on('success', (msg) => logLevel.success && log.success(`Device: ${host} ${name}, ${msg}`))
      .on('info', (msg) => log.info(`Device: ${host} ${name}, ${msg}`))
      .on('debug', (msg) => log.info(`Device: ${host} ${name}, debug: ${msg}`))
      .on('warn', (msg) => log.warn(`Device: ${host} ${name}, ${msg}`))
      .on('error', (msg) => log.error(`Device: ${host} ${name}, ${msg}`));

    const accessory = await router.start();
    if (accessory) {
      api.publishExternalAccessories(PluginName, [accessory]);
      if (logLevel.success) log.success(`Device: ${host} ${name}, Published as external accessory.`);
    }

    // Stop startup generator and hand off to the openWrt class generator
    await impulseGenerator.state(false);
    await openWrt.impulseGenerator.state(true, [{ name: 'connect', sampling: refreshInterval }], false);
  }

  // ── Homebridge accessory cache ────────────────────────────────────────────

  configureAccessory(accessory) {
    this.accessories.push(accessory);
  }
}

export default (api) => {
  api.registerPlatform(PluginName, PlatformName, OpenWrtPlatform);
};