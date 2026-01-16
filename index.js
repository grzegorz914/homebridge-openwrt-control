import { join } from 'path';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import OpenWrt from './src/openwrt.js';
import AccessPoint from './src/apdevice.js';
import Switch from './src/swdevice.js';
import ImpulseGenerator from './src/impulsegenerator.js';
import { PluginName, PlatformName } from './src/constants.js';

class OpenWrtPlatform {
  constructor(log, config, api) {
    // only load if configured
    if (!config || !Array.isArray(config.devices)) {
      log.warn(`No configuration found for ${PluginName}`);
      return;
    }
    this.accessories = [];
    this.devices = [];

    //check if prefs directory exist
    const prefDir = join(api.user.storagePath(), 'openWrt');
    try {
      mkdirSync(prefDir, { recursive: true });
    } catch (error) {
      log.error(`Prepare directory error: ${error.message ?? error}`);
      return;
    }

    api.on('didFinishLaunching', async () => {
      for (const config of config.devices) {
        const { name, host, port, displayType } = config;
        if (!name || !host || !port || !displayType) {
          log.warn(`Device: ${host || 'host missing'},  ${name || 'name missing'}, ${port || 'port missing'}${!displayType ? ', disply type disabled' : ''} in config, will not be published in the Home app`);
          continue;
        }

        //log config
        const logLevel = {
          devInfo: config.log?.deviceInfo,
          success: config.log?.success,
          info: config.log?.info,
          warn: config.log?.warn,
          error: config.log?.error,
          debug: config.log?.debug
        };

        if (logLevel.debug) {
          log.info(`Device: ${host} ${name}, did finish launching.`);
          const safeConfig = {
            ...config,
            auth: {
              ...config.auth,
              passwd: 'removed',
            },
            mqtt: {
              auth: {
                ...config.mqtt?.auth,
                passwd: 'removed',
              }
            },
          };
          log.info(`Device: ${host} ${name}, Config: ${JSON.stringify(safeConfig, null, 2)}`);
        }

        const refreshInterval = (config.refreshInterval ?? 5) * 1000;
        if (config.accessPoint?.enable) this.devices.push('accessPoint');
        if (config.switch?.enable) this.devices.push('switch');

        if (this.devices.length === 0) return;

        const openWrt = new OpenWrt(config)
          .on('success', msg => logLevel.success && log.success(`Device: ${host}, ${msg}`))
          .on('info', msg => log.info(`Device: ${host}, ${msg}`))
          .on('debug', msg => log.info(`Device: ${host}, debug: ${msg}`))
          .on('warn', msg => log.warn(`Device: ${host}, ${msg}`))
          .on('error', msg => log.error(`Device: ${host}, ${msg}`))

        const openWrtInfo = await openWrt.connect();
        if (!openWrtInfo.state) {
          if (logLevel.warn) log.warn(`Device: ${host} ${name}, no data received`);
          return;
        }

        try {
          for (const device of this.devices) {
            // create impulse generator
            const impulseGenerator = new ImpulseGenerator()
              .on('start', async () => {
                try {

                  // create device instance
                  let type;
                  switch (device) {
                    case 'accessPoint': type = new AccessPoint(api, config, openWrt, openWrtInfo); break;
                    case 'switch': type = new Switch(api, config, openWrt, openWrtInfo); break;
                    default:
                      if (logLevel.warn) log.warn(`Device: ${host} ${name}, unknown zone: ${zoneControl}`);
                      return;
                  }

                  type
                    .on('devInfo', msg => logLevel.devInfo && log.info(msg))
                    .on('success', msg => logLevel.success && log.success(`Device: ${host} ${name}, ${msg}`))
                    .on('info', msg => log.info(`Device: ${host} ${name}, ${msg}`))
                    .on('debug', msg => log.info(`Device: ${host} ${name}, debug: ${msg}`))
                    .on('warn', msg => log.warn(`Device: ${host} ${name}, ${msg}`))
                    .on('error', msg => log.error(`Device: ${host} ${name}, ${msg}`));

                  const accessory = await type.start();
                  if (accessory) {
                    api.publishExternalAccessories(PluginName, [accessory]);
                    if (logLevel.success) log.success(`Device: ${host} ${name}, Published as external accessory.`);
                  }

                  // stop master impulse generator
                  await impulseGenerator.state(false);
                } catch (error) {
                  if (logLevel.error) log.error(`Device: ${host} ${name}, Start impulse generator error: ${error.message ?? error}, trying again.`);
                }
              })
              .on('state', (state) => {
                if (logLevel.debug) log.info(`Device: ${host} ${name}, Start impulse generator ${state ? 'started' : 'stopped'}.`);
              });

            // start impulse generator
            await impulseGenerator.state(true, [{ name: 'start', sampling: 120000 }]);
          }

          // start openwrt impulse generator
          await openWrt.impulseGenerator.state(true, [{ name: 'connect', sampling: refreshInterval }], false);
        } catch (error) {
          if (logLevel.error) log.error(`Device: ${host} ${name}, Did finish launching error: ${error.message ?? error}`);
        }
      }
    });
  }

  configureAccessory(accessory) {
    this.accessories.push(accessory);
  }
}

export default (api) => {
  api.registerPlatform(PluginName, PlatformName, OpenWrtPlatform);
}