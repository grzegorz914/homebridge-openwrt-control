import EventEmitter from 'events';
import RestFul from './restful.js';
import Mqtt from './mqtt.js';

let Accessory, Characteristic, Service, Categories, AccessoryUUID;

class Router extends EventEmitter {
    constructor(api, config, openWrt, openWrtInfo) {
        super();

        Accessory = api.platformAccessory;
        Characteristic = api.hap.Characteristic;
        Service = api.hap.Service;
        Categories = api.hap.Categories;
        AccessoryUUID = api.hap.uuid;

        // config
        this.config = config;
        this.host = config.host;
        this.name = config.name || `Router ${openWrtInfo.systemInfo.model}`;
        this.wirelessRadio = config.wireless?.radio || {};
        this.wirelessRadioControl = this.wirelessRadio.control || {};
        this.wirelessRadioSensor = this.wirelessRadio.sensor || {};
        this.wirelessSsid = config.wireless?.ssid || {};
        this.wirelessSsidControl = this.wirelessSsid.control || {};
        this.wirelessSsidSensor = this.wirelessSsid.sensor || {};
        this.buttons = (config.buttons ?? []).filter(b => (b.displayType ?? 0) > 0);
        this.logDeviceInfo = config.log?.deviceInfo || false;
        this.logInfo = config.log?.info || false;
        this.logDebug = config.log?.debug || false;

        // external integrations
        this.restFul = config.restFul || {};
        this.restFulConnected = false;
        this.mqtt = config.mqtt || {};
        this.mqttConnected = false;

        // buttons
        for (const button of this.buttons) {
            button.serviceType = [null, Service.Outlet, Service.Switch][button.displayType];
            button.state = false;
        }

        // openwrt
        this.openWrt = openWrt;
        this.openWrtInfo = openWrtInfo;

        openWrt.on('openWrtInfo', async (openWrtInfo) => {
            this.openWrtInfo = openWrtInfo;
            this.informationService?.updateCharacteristic(Characteristic.FirmwareRevision, openWrtInfo.systemInfo.release?.version);

            const linkUp = openWrtInfo.linkUp ? 1 : 2; // 0= Not Supported, 1=Connected, 2=Disconnected
            this.routerService?.updateCharacteristic(Characteristic.WiFiSatelliteStatus, linkUp);

            // RADIOS
            const currentRadios = [];
            for (const radio of openWrtInfo.wirelessRadios) {
                const name = radio.device;
                const band = radio.band;
                const state = radio.disabled;

                const radioId = `radio:${name}:${band}`;
                currentRadios.push(radioId);

                let added = false;

                // controls
                if (this.wirelessRadioControl.displayType > 0) {
                    const serviceName = this.wirelessRadioControl.namePrefix ? `${this.name} ${name} ${band}` : `${name} ${band}`;
                    const existing = this.radioServices.find(s => s.subtype === radioId);

                    if (!existing) {
                        await this.addRadio(radio);
                        added = true;
                    } else {
                        const characteristicType = [null, Characteristic.On, Characteristic.On, Characteristic.On][this.wirelessRadioControl.displayType];
                        existing.setCharacteristic(Characteristic.ConfiguredName, serviceName)
                            .updateCharacteristic(characteristicType, !state);
                    }
                }

                // sensors
                if (this.wirelessRadioSensor.displayType > 0) {
                    const serviceName = this.wirelessRadioSensor.namePrefix ? `${this.name} ${name} ${band}` : `${name} ${band}`;
                    const existingSensor = this.radioSensorServices.find(s => s.subtype === radioId);

                    if (!existingSensor && !added) {
                        await this.addRadio(radio);
                    } else if (existingSensor) {
                        const sensorCharacteristic = [null, Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][this.wirelessRadioSensor.displayType];
                        existingSensor.setCharacteristic(Characteristic.ConfiguredName, serviceName)
                            .updateCharacteristic(sensorCharacteristic, !state);
                    }
                }
            }

            // Remove not existing radios
            for (let i = this.radioServices.length - 1; i >= 0; i--) {
                const s = this.radioServices[i];
                if (!currentRadios.includes(s.subtype)) {
                    this.accessory.removeService(s);
                    this.radioServices.splice(i, 1);
                    if (this.logDebug) this.emit('debug', `Removed radio control ${s.displayName}`);
                }
            }

            for (let i = this.radioSensorServices.length - 1; i >= 0; i--) {
                const s = this.radioSensorServices[i];
                if (!currentRadios.includes(s.subtype)) {
                    this.accessory.removeService(s);
                    this.radioSensorServices.splice(i, 1);
                    if (this.logDebug) this.emit('debug', `Removed radio sensor ${s.displayName}`);
                }
            }

            // SSIDS
            const currentSsids = [];
            for (const ssid of openWrtInfo.wirelessSsids) {
                const radio = ssid.device;
                const band = ssid.band;
                const name = ssid.name;
                const state = ssid.disabled;

                const ssidId = `ssid:${name}:${radio}:${band}`;
                currentSsids.push(ssidId);

                let added = false;

                // controls
                if (this.wirelessSsidControl.displayType > 0) {
                    const serviceName = this.wirelessSsidControl.namePrefix ? `${this.name} ${name} ${band}` : `${name} ${band}`;
                    const existing = this.ssidServices.find(s => s.subtype === ssidId);

                    if (!existing) {
                        await this.addSSID(ssid);
                        added = true;
                    } else {
                        const characteristicType = [null, Characteristic.On, Characteristic.On, Characteristic.On][this.wirelessSsidControl.displayType];
                        existing.setCharacteristic(Characteristic.ConfiguredName, serviceName)
                            .updateCharacteristic(characteristicType, !state);
                    }
                }

                // sensors
                if (this.wirelessSsidSensor.displayType > 0) {
                    const serviceName = this.wirelessSsidSensor.namePrefix ? `${this.name} ${name} ${band}` : `${name} ${band}`;
                    const existingSensor = this.ssidSensorServices.find(s => s.subtype === ssidId);

                    if (!existingSensor && !added) {
                        await this.addSSID(ssid);
                    } else if (existingSensor) {
                        const sensorCharacteristic = [null, Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][this.wirelessSsidSensor.displayType];
                        existingSensor.setCharacteristic(Characteristic.ConfiguredName, serviceName)
                            .updateCharacteristic(sensorCharacteristic, !state);
                    }
                }
            }

            // Remove not existing ssids
            for (let i = this.ssidServices.length - 1; i >= 0; i--) {
                const s = this.ssidServices[i];
                if (!currentSsids.includes(s.subtype)) {
                    this.accessory.removeService(s);
                    this.ssidServices.splice(i, 1);
                    if (this.logDebug) this.emit('debug', `Removed SSID control ${s.displayName}`);
                }
            }

            for (let i = this.ssidSensorServices.length - 1; i >= 0; i--) {
                const s = this.ssidSensorServices[i];
                if (!currentSsids.includes(s.subtype)) {
                    this.accessory.removeService(s);
                    this.ssidSensorServices.splice(i, 1);
                    if (this.logDebug) this.emit('debug', `Removed SSID sensor ${s.displayName}`);
                }
            }

            // Buttons
            for (let i = 0; i < this.buttons.length; i++) {
                const button = this.buttons[i];
                const name = button.name || `Button ${i}`;
                const serviceName = button.namePrefix ? `${this.name} ${name}` : name;
                button.state = false;
                this.buttonServices?.[i]
                    ?.setCharacteristic(Characteristic.ConfiguredName, serviceName)
                    .updateCharacteristic(Characteristic.On, button.state);
            }

            // External integrations
            if (this.restFulConnected) this.restFul1.update('info', info);
            if (this.mqttConnected) this.mqtt1.emit('publish', 'Info', info);
        });
    }

    async externalIntegrations() {
        if (this.restFul.enable) {
            this.restFul1 = new RestFul({
                port: this.restFul.port || 3000,
                logDebug: this.logDebug
            })
                .on('connected', msg => {
                    this.restFulConnected = true;
                    this.emit('success', msg);
                })
                .on('set', async (key, value) => {
                    await this.setOverExternalIntegration('RESTFul', key, value);
                })
                .on('debug', d => this.emit('debug', d))
                .on('warn', w => this.emit('warn', w))
                .on('error', e => this.emit('error', e));
        }

        if (this.mqtt.enable) {
            this.mqtt1 = new Mqtt({
                host: this.mqtt.host,
                port: this.mqtt.port || 1883,
                clientId: `${this.name}_${Math.random().toString(16).slice(3)}`,
                prefix: this.mqtt.prefix
                    ? `${this.openWrtInfo.systemInfo.model}/${this.mqtt.prefix}/${this.name}`
                    : `${this.openWrtInfo.systemInfo.model}/${this.name}`,
                user: this.mqtt.auth?.user,
                passwd: this.mqtt.auth?.passwd,
                logDebug: this.logDebug
            })
                .on('connected', msg => {
                    this.mqttConnected = true;
                    this.emit('success', msg);
                })
                .on('set', async (key, value) => {
                    await this.setOverExternalIntegration('MQTT', key, value);
                })
                .on('debug', d => this.emit('debug', d))
                .on('warn', w => this.emit('warn', w))
                .on('error', e => this.emit('error', e));
        }

        return true;
    }

    async setOverExternalIntegration(integration, key, value) {
        if (!value) return false;

        switch (key) {
            case 'SystemReboot':
                return this.openWrt.send('button', null, null, 0);
            case 'NetworkReload':
                return this.openWrt.send('button', null, null, 1);
            case 'WiFiReload':
                return this.openWrt.send('button', null, null, 2);
            default:
                this.emit('warn', `${integration} unknown key ${key}`);
                return false;
        }
    }

    async addRadio(radio) {
        const accessoryName = this.name;
        const name = radio.device;
        const band = radio.band;
        const radioId = `radio:${name}:${band}`;

        // control
        if (this.wirelessRadioControl.displayType > 0) {
            const serviceType = [null, Service.Switch, Service.Outlet, Service.Lightbulb][this.wirelessRadioControl.displayType];
            const serviceName = this.wirelessRadioControl.namePrefix ? `${accessoryName} ${name} ${band}` : `${name} ${band}`;
            const service = this.accessory.addService(serviceType, serviceName, radioId);
            service.addOptionalCharacteristic(Characteristic.ConfiguredName);
            service.setCharacteristic(Characteristic.ConfiguredName, serviceName);
            service.getCharacteristic(Characteristic.On)
                .onGet(async () => {
                    const current = this.openWrtInfo.wirelessRadios.find(r => r.device === name && r.band === band);
                    return current ? !current.disabled : false;
                })
                .onSet(async (state) => {
                    const restart = this.wirelessRadioControl.restart;
                    await this.openWrt.send('radio', null, name, state, restart);
                });

            this.radioServices.push(service);
        }

        // sensor
        if (this.wirelessRadioSensor.displayType > 0) {
            const sensorType = [null, Service.MotionSensor, Service.OccupancySensor, Service.ContactSensor][this.wirelessRadioSensor.displayType];
            const sensorCharacteristic = [null, Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][this.wirelessRadioSensor.displayType];
            const sensorName = this.wirelessRadioSensor.namePrefix ? `${accessoryName} ${name} ${band}` : `${name} ${band}`;
            const sensorService = this.accessory.addService(sensorType, sensorName, radioId);
            sensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
            sensorService.setCharacteristic(Characteristic.ConfiguredName, sensorName);

            sensorService.getCharacteristic(sensorCharacteristic)
                .onGet(async () => {
                    const current = this.openWrtInfo.wirelessRadios.find(r => r.device === name && r.band === band);
                    return current ? !current.disabled : false;
                });

            this.radioSensorServices.push(sensorService);
        }

        if (this.logDebug) this.emit('debug', `Added radio ${name} ${band}`);
    }

    async addSSID(ssid) {
        const accessoryName = this.name;
        const radio = ssid.device;
        const band = ssid.band;
        const name = ssid.name;
        const ssidId = `ssid:${name}:${radio}:${band}`;

        // control
        if (this.wirelessSsidControl.displayType > 0) {
            const serviceType = [null, Service.Switch, Service.Outlet, Service.Lightbulb][this.wirelessSsidControl.displayType];
            const serviceName = this.wirelessSsidControl.namePrefix ? `${accessoryName} ${name} ${band}` : `${name} ${band}`;
            const service = this.accessory.addService(serviceType, serviceName, ssidId);
            service.addOptionalCharacteristic(Characteristic.ConfiguredName);
            service.setCharacteristic(Characteristic.ConfiguredName, serviceName);
            service.getCharacteristic(Characteristic.On)
                .onGet(async () => {
                    const current = this.openWrtInfo.wirelessSsids.find(s => s.name === name && s.device === radio && s.band === band);
                    return current ? !current.disabled : false;
                })
                .onSet(async (state) => {
                    await this.openWrt.send('ssid', radio, name, state);
                });

            this.ssidServices.push(service);
        }

        // sensor
        if (this.wirelessSsidSensor.displayType > 0) {
            const sensorType = [null, Service.MotionSensor, Service.OccupancySensor, Service.ContactSensor][this.wirelessSsidSensor.displayType];
            const sensorCharacteristic = [null, Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][this.wirelessSsidSensor.displayType];
            const sensorName = this.wirelessSsidSensor.namePrefix ? `${accessoryName} ${name} ${band}` : `${name} ${band}`;
            const sensorService = this.accessory.addService(sensorType, sensorName, ssidId);
            sensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
            sensorService.setCharacteristic(Characteristic.ConfiguredName, sensorName);
            sensorService.getCharacteristic(sensorCharacteristic)
                .onGet(async () => {
                    const current = this.openWrtInfo.wirelessSsids.find(s => s.name === name && s.device === radio && s.band === band);
                    return current ? !current.disabled : false;
                });

            this.ssidSensorServices.push(sensorService);
        }

        if (this.logDebug) this.emit('debug', `Added SSID ${name} ${radio} ${band}`);
    }

    async prepareAccessory() {
        const accessoryUUID = AccessoryUUID.generate(this.host + this.openWrtInfo.systemInfo.system);
        const accessory = new Accessory(this.name, accessoryUUID, Categories.AIRPORT);
        this.accessory = accessory;

        this.informationService = accessory.getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, this.openWrtInfo.systemInfo.release.distribution || 'OpenWrt')
            .setCharacteristic(Characteristic.Model, this.openWrtInfo.systemInfo.model)
            .setCharacteristic(Characteristic.SerialNumber, this.openWrtInfo.systemInfo.system)
            .setCharacteristic(Characteristic.FirmwareRevision, this.openWrtInfo.systemInfo.release?.version);

        // Router
        const routerService = new Service.WiFiSatellite(this.name, 'routerService');
        routerService.setPrimaryService(true);
        routerService.addOptionalCharacteristic(Characteristic.ConfiguredName);
        routerService.setCharacteristic(Characteristic.ConfiguredName, this.name);
        routerService.getCharacteristic(Characteristic.WiFiSatelliteStatus)
            .onGet(async () => {
                const linkUp = this.openWrtInfo.linkUp ? 1 : 2; // 0= Not Supported, 1=Connected, 2=Disconnected
                return linkUp;
            })

        this.routerService = routerService;
        accessory.addService(routerService);

        // Radios
        this.radioServices = [];
        this.radioSensorServices = [];
        for (const radio of this.openWrtInfo.wirelessRadios) {
            await this.addRadio(radio);
        }

        // SSIDs
        this.ssidServices = [];
        this.ssidSensorServices = [];
        for (const ssid of this.openWrtInfo.wirelessSsids) {
            await this.addSSID(ssid);
        }

        // Buttons
        this.buttonServices = [];
        for (let i = 0; i < this.buttons.length; i++) {
            const button = this.buttons[i];
            const name = button.name || `Button ${i}`;
            const serviceName = button.namePrefix ? `${this.name} ${name}` : name;

            const buttonService = accessory.addService(button.serviceType, serviceName, `buttonService${i}`);
            buttonService.addOptionalCharacteristic(Characteristic.ConfiguredName);
            buttonService.setCharacteristic(Characteristic.ConfiguredName, serviceName);
            buttonService.getCharacteristic(Characteristic.On)
                .onGet(() => button.state)
                .onSet(async (state) => {
                    if (!state) return;

                    button.state = true;
                    await this.openWrt.send('button', null, null, button.command);
                    setTimeout(() => {
                        button.state = false;
                        buttonService.updateCharacteristic(Characteristic.On, false);
                    }, 300);
                });

            this.buttonServices.push(buttonService);
        }

        return accessory;
    }

    async start() {
        //start external integrations
        if (this.restFul.enable || this.mqtt.enable) await this.externalIntegrations();

        if (this.logDeviceInfo) {
            this.emit('devInfo', `-------- ${this.name} --------`);
            this.emit('devInfo', `Model: ${this.openWrtInfo.systemInfo.model}`);
            this.emit('devInfo', `System: ${this.openWrtInfo.systemInfo.system}`);
            this.emit('devInfo', `Kernel: ${this.openWrtInfo.systemInfo.kernel}`);
            this.emit('devInfo', `Firmware: ${this.openWrtInfo.systemInfo.release?.description}`);
            this.emit('devInfo', `Radios: ${this.openWrtInfo.wirelessRadios.length}`);
            this.emit('devInfo', `SSIDs: ${this.openWrtInfo.wirelessSsids.length}`);
            this.emit('devInfo', `----------------------------------`);
        }

        return await this.prepareAccessory();
    }
}

export default Router;
