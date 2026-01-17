import EventEmitter from 'events';
import RestFul from './restful.js';
import Mqtt from './mqtt.js';
let Accessory, Characteristic, Service, Categories, AccessoryUUID;

class Switch extends EventEmitter {
    constructor(api, config, openWrt, openWrtInfo) {
        super();

        Accessory = api.platformAccessory;
        Characteristic = api.hap.Characteristic;
        Service = api.hap.Service;
        Categories = api.hap.Categories;
        AccessoryUUID = api.hap.uuid;

        //config
        this.config = config;
        this.host = config.host;
        this.name = config.apDevice?.name || openWrtInfo.systemInfo.hostname;
        this.namePrefix = config.apDevice?.namePrefix || false;
        this.sensorsEnabled = config.apDevice?.sensor || false
        this.logDeviceInfo = config.log?.deviceInfo || false;
        this.logInfo = config.log?.info || false;
        this.logDebug = config.log?.debug || false;

        //external integration
        this.restFul = config.restFul || {};
        this.restFulConnected = false;
        this.mqtt = config.mqtt || {};
        this.mqttConnected = false;

        //openwrt
        this.openWrt = openWrt;
        this.openWrtInfo = openWrtInfo;

        //openwrt client
        openWrt.on('openWrtInfo', (openWrtInfo) => {
            this.informationService?.updateCharacteristic(Characteristic.FirmwareRevision, openWrtInfo.systemInfo.release?.version);

            // update state
            const ports = openWrtInfo.ports;
            for (let i = 0; i < ports.length; i++) {
                const port = ports[i];
                const name = port.name;
                const state = port.state;
                const serviceName = this.namePrefix ? `${this.name} ${name}` : name;
                this.services?.[i]
                    ?.setCharacteristic(Characteristic.ConfiguredName, serviceName)
                    .updateCharacteristic(Characteristic.On, state);

                this.sensorServices?.[i]
                    ?.setCharacteristic(Characteristic.ConfiguredName, serviceName)
                    .updateCharacteristic(Characteristic.ContactSensorState, state);

                if (this.logInfo) {
                    this.emit('info', `Name: ${port.name}`);
                    this.emit('info', `State: ${port.state}`);
                    this.emit('info', `Mode: ${port.mode}`);
                }
            }

            //restFul and mqtt
            if (this.restFulConnected) this.emit('restFul', 'info', openWrtInfo);
            if (this.mqttConnected) this.emit('mqtt', 'Info', openWrtInfo);
        });
    };

    async externalIntegrations() {
        //RESTFul server
        const restFulEnabled = this.restFul.enable || false;
        if (restFulEnabled) {
            try {
                this.restFul1 = new RestFul({
                    port: this.restFul.port || 3000,
                    logWarn: this.logWarn,
                    logDebug: this.logDebug
                })
                    .on('connected', (message) => {
                        this.emit('success', message);
                        this.restFulConnected = true;
                    })
                    .on('set', async (key, value) => {
                        try {
                            await this.setOverExternalIntegration('RESTFul', key, value);
                        } catch (error) {
                            this.emit('warn', `RESTFul set error: ${error}`);
                        };
                    })
                    .on('debug', (debug) => this.emit('debug', debug))
                    .on('warn', (warn) => this.emit('warn', warn))
                    .on('error', (error) => this.emit('error', error));
            } catch (error) {
                this.emit('warn', `RESTFul integration start error: ${error}`);
            };
        }

        //mqtt client
        const mqttEnabled = this.mqtt.enable || false;
        if (mqttEnabled) {
            try {
                this.mqtt1 = new Mqtt({
                    host: this.mqtt.host,
                    port: this.mqtt.port || 1883,
                    clientId: this.mqtt.clientId ? `${this.openWrtInfo.systemInfo.release.distribution || 'OpenWrt'}_${this.mqtt.clientId}_${Math.random().toString(16).slice(3)}` : `${this.openWrtInfo.systemInfo.release.distribution || 'OpenWrt'}_${Math.random().toString(16).slice(3)}`,
                    prefix: this.mqtt.prefix ? `${this.openWrtInfo.systemInfo.release.distribution || 'OpenWrt'}/${this.mqtt.prefix}/${this.name}` : `${this.openWrtInfo.systemInfo.release.distribution || 'OpenWrt'}/${this.name}`,
                    user: this.mqtt.auth?.user,
                    passwd: this.mqtt.auth?.passwd,
                    logWarn: this.logWarn,
                    logDebug: this.logDebug
                })
                    .on('connected', (message) => {
                        this.emit('success', message);
                        this.mqttConnected = true;
                    })
                    .on('subscribed', (message) => {
                        this.emit('success', message);
                    })
                    .on('set', async (key, value) => {
                        try {
                            await this.setOverExternalIntegration('MQTT', key, value);
                        } catch (error) {
                            this.emit('warn', `MQTT set error: ${error}`);
                        }
                    })
                    .on('debug', (debug) => this.emit('debug', debug))
                    .on('warn', (warn) => this.emit('warn', warn))
                    .on('error', (error) => this.emit('error', error));
            } catch (error) {
                this.emit('warn', `MQTT integration start error: ${error}`);
            };
        }

        return true;
    }

    async setOverExternalIntegration(integration, key, value) {
        try {
            let set = false
            switch (key) {
                case 'Power':
                    const powerState = value ? 'ON' : 'OFF';
                    set = await this.openWrt.send('Power', powerState);
                    break;
                default:
                    this.emit('warn', `${integration}, received key: ${key}, value: ${value}`);
                    break;
            }
            return set;
        } catch (error) {
            throw new Error(`${integration} set key: ${key}, value: ${value}, error: ${error}`);
        }
    }

    //prepare accessory
    async prepareAccessory() {
        try {
            //prepare accessory
            if (this.logDebug) this.emit('debug', `prepare accessory`);
            const accessoryName = this.name;
            const accessoryUUID = AccessoryUUID.generate(this.host + this.openWrtInfo.systemInfo.system);
            const accessoryCategory = Categories.AIRPORT;
            const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);

            //prepare information service
            if (this.logDebug) this.emit('debug', `prepare information service`);
            this.informationService = accessory.getService(Service.AccessoryInformation)
                .setCharacteristic(Characteristic.Manufacturer, this.openWrtInfo.systemInfo.release.distribution || 'OpenWrt')
                .setCharacteristic(Characteristic.Model, this.openWrtInfo.systemInfo.model)
                .setCharacteristic(Characteristic.SerialNumber, this.openWrtInfo.systemInfo.system)
                .setCharacteristic(Characteristic.FirmwareRevision, this.openWrtInfo.systemInfo.release?.version);

            if (this.logDebug) this.emit('debug', `prepare service`);

            //services
            this.services = [];
            this.sensorServices = [];
            for (const port of this.openWrtInfo.ports) {
                const name = port.name;
                if (this.logDebug) this.emit('debug', `prepare port: ${name} service`);

                const serviceName = this.namePrefix ? `${accessoryName} ${name}` : name;
                const service = accessory.addService(Service.Switch, serviceName, `service${name}`);
                service.addOptionalCharacteristic(Characteristic.ConfiguredName);
                service.setCharacteristic(Characteristic.ConfiguredName, serviceName);
                service.getCharacteristic(Characteristic.On)
                    .onGet(async () => {
                        const state = port.state;
                        if (this.logInfo) this.emit('message', `Port: ${name}, state: ${state ? 'Enabled' : 'Disabled'}`);
                        return state;
                    })
                    .onSet(async (state) => {
                        try {
                            state = state ? true : false;
                            await this.openWrt.send('port', name, state);
                            if (this.logInfo) this.emit('message', `Port: ${name}, set State: ${state ? 'Enabled' : 'Disabled'}`);
                        } catch (error) {
                            this.emit('warn', `Port: ${name}, set state error: ${error}`);
                        }
                    });
                this.services.push(service);

                if (this.sensorsEnabled) {
                    if (this.logDebug) this.emit('debug', `prepare port: ${name} sensor service`);
                    const sensorService = accessory.addService(Service.ContactSensor, serviceName, `sensorService${name}`);
                    sensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    sensorService.setCharacteristic(Characteristic.ConfiguredName, serviceName);
                    sensorService.getCharacteristic(Characteristic.ContactSensorState)
                        .onGet(async () => {
                            const state = port.state;
                            return state;
                        });
                    this.sensorServices.push(sensorService);
                };
            };

            return accessory;
        } catch (error) {
            throw new Error(error);
        };
    };

    //start
    async start() {
        try {
            //start external integrations
            if (this.restFul.enable || this.mqtt.enable) await this.externalIntegrations();

            if (this.logDeviceInfo) {
                this.emit('devInfo', `-------- Access Point ${this.name} --------`);
                this.emit('devInfo', `Model: ${this.openWrtInfo.systemInfo.model || this.openWrtInfo.systemInfo.board_name}`);
                this.emit('devInfo', `System: ${this.openWrtInfo.systemInfo.system}`);
                this.emit('devInfo', `Kernel: ${this.openWrtInfo.systemInfo.kernel}`);
                this.emit('devInfo', `Firmware: ${this.openWrtInfo.systemInfo.release?.description}`);
                this.emit('devInfo', `Target: ${this.openWrtInfo.systemInfo.release?.target}`);
                this.emit('devInfo', `Ports: ${this.openWrtInfo.ports.length}`);
                this.emit('devInfo', `----------------------------------`);
            }

            //prepare accessory
            const accessory = await this.prepareAccessory();
            return accessory;
        } catch (error) {
            throw new Error(`Start error: ${error}`);
        }
    }
};
export default Switch;
