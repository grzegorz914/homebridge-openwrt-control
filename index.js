import { join } from 'path';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import OpenWrt from './src/openwrt.js';
import AccessPoint from './src/accesspoint.js';
import Switch from './src/switch.js';
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

    //check if prefs directory exist
    const prefDir = join(api.user.storagePath(), 'openWrt');
    try {
      mkdirSync(prefDir, { recursive: true });
    } catch (error) {
      log.error(`Prepare directory error: ${error.message ?? error}`);
      return;
    }

    api.on('didFinishLaunching', async () => {
      for (const device of config.devices) {
        const { name, host, displayType } = device;
        if (!name || !host || !displayType) {
          log.warn(`Device: ${host || 'host missing'},  ${name || 'name missing'}, ${!displayType ? ', display type disabled' : ''} in config, will not be published in the Home app`);
          continue;
        }
        const apDevice = device.apDevice || {};
        const swDevice = device.swDevice || {};
        const refreshInterval = (device.refreshInterval ?? 5) * 1000;

        //check enabled devices
        const configuredDevices = [];
        if (apDevice.enable) configuredDevices.push(0);
        if (swDevice.enable) configuredDevices.push(1);
        if (configuredDevices.length === 0) continue;

        //log config
        const logLevel = {
          devInfo: device.log?.deviceInfo,
          success: device.log?.success,
          info: device.log?.info,
          warn: device.log?.warn,
          error: device.log?.error,
          debug: device.log?.debug
        };

        if (logLevel.debug) {
          log.info(`Device: ${host} ${name}, did finish launching.`);
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
              }
            },
          };
          log.info(`Device: ${host} ${name}, Config: ${JSON.stringify(safeConfig, null, 2)}`);
        }

        try {
          // create impulse generator for every device
          const impulseGenerator = new ImpulseGenerator()
            .on('start', async () => {
              try {

                const openWrt = new OpenWrt(device)
                  .on('success', msg => logLevel.success && log.success(`Device: ${host}, ${msg}`))
                  .on('info', msg => log.info(`Device: ${host} ${name}, ${msg}`))
                  .on('debug', msg => log.info(`Device: ${host} ${name}, debug: ${msg}`))
                  .on('warn', msg => log.warn(`Device: ${host} ${name}, ${msg}`))
                  .on('error', msg => log.error(`Device: ${host} ${name}, ${msg}`));

                const openWrtInfo = await openWrt.connect();
                if (!openWrtInfo.state) {
                  if (logLevel.warn) log.warn(`Device: ${host} ${name}, ${openWrtInfo.info}`);
                  return;
                }
                if (logLevel.success) log.success(`Device: ${host} ${name}, ${openWrtInfo.info}`);

                // start openwrt impulse generator
                await openWrt.impulseGenerator.state(true, [{ name: 'connect', sampling: refreshInterval }], false);

                for (const deviceType of configuredDevices) {
                  let configuredDevice;
                  switch (deviceType) {
                    case 0:
                      configuredDevice = new AccessPoint(api, device, openWrt, openWrtInfo);
                      break;
                    case 1:
                      configuredDevice = new Switch(api, device, openWrt, openWrtInfo);
                      break;
                    default:
                      if (logLevel.warn) log.warn(`Device: ${host} ${name}, class not found for: ${deviceType}`);
                      return;
                  }

                  configuredDevice.on('devInfo', msg => logLevel.devInfo && log.info(msg))
                    .on('success', msg => logLevel.success && log.success(`Device: ${host} ${name}, ${msg}`))
                    .on('info', msg => log.info(`Device: ${host} ${name}, ${msg}`))
                    .on('debug', msg => log.info(`Device: ${host} ${name}, debug: ${msg}`))
                    .on('warn', msg => log.warn(`Device: ${host} ${name}, ${msg}`))
                    .on('error', msg => log.error(`Device: ${host} ${name}, ${msg}`));

                  const accessory = await configuredDevice.start();
                  if (accessory) {
                    api.publishExternalAccessories(PluginName, [accessory]);
                    if (logLevel.success) log.success(`Device: ${host} ${name}, Published as external accessory.`);
                  }
                }

                // stop accessory impulse generator
                await impulseGenerator.state(false);
              } catch (error) {
                if (logLevel.error) log.error(`Device: ${host} ${name}, Start impulse generator error: ${error.message ?? error}, trying again.`);
              }
            })
            .on('state', (state) => {
              if (logLevel.debug) log.info(`Device: ${host} ${name}, Start impulse generator ${state ? 'started' : 'stopped'}.`);
            });

          // start accessory impulse generator
          await impulseGenerator.state(true, [{ name: 'start', sampling: 120000 }]);
        } catch (error) {
          if (logLevel.error) log.error(`Device: ${host} ${name}, Did finish launching error: ${error.message ?? error}`);
        }

        await new Promise(r => setTimeout(r, 500));
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