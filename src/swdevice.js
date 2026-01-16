import EventEmitter from 'events';
let Accessory, Characteristic, Service, Categories, AccessoryUUID;

class SwitchDevice extends EventEmitter {
    constructor(api, config, openWrt, openWrtInfo) {
        super();

        Accessory = api.platformAccessory;
        Characteristic = api.hap.Characteristic;
        Service = api.hap.Service;
        Categories = api.hap.Categories;
        AccessoryUUID = api.hap.uuid;

        //config
        this.name = config.name;
        this.switch = config.switch;
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
        this.ssids = openWrtInfo.ssids;
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
                    clientId: this.mqtt.clientId ? `${this.savedInfo.manufacturer}_${this.mqtt.clientId}_${Math.random().toString(16).slice(3)}` : `${this.savedInfo.manufacturer}_${Math.random().toString(16).slice(3)}`,
                    prefix: this.mqtt.prefix ? `${this.savedInfo.manufacturer}/${this.mqtt.prefix}/${this.name}` : `${this.savedInfo.manufacturer}/${this.name}`,
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
            const accessoryUUID = AccessoryUUID.generate(this.deviceUuid);
            const accessoryCategory = Categories.AIRPORT;
            const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);

            //prepare information service
            if (this.logDebug) this.emit('debug', `prepare information service`);
            accessory.getService(Service.AccessoryInformation)
                .setCharacteristic(Characteristic.Manufacturer, 'OpenWrt')
                .setCharacteristic(Characteristic.Model, accessoryName)
                .setCharacteristic(Characteristic.SerialNumber, this.networkId)
                .setCharacteristic(Characteristic.FirmwareRevision, this.organizationId)
                .setCharacteristic(Characteristic.ConfiguredName, accessoryName);

            if (this.logDebug) this.emit('debug', `prepare service`);

            //device
            this.services = [];
            for (const ssid of this.ssids) {
                const ssidName = ssid.name;
                if (this.logDebug) this.emit('debug', `prepare ssid: ${ssidName} service`);

                const serviceName = this.accessPoint.namePrefix ? `${this.name} ${ssidName}` : ssidName;
                const service = accessory.addService(Service.Switch, serviceName, `service${ssidName}`);
                service.addOptionalCharacteristic(Characteristic.ConfiguredName);
                service.setCharacteristic(Characteristic.ConfiguredName, serviceName);
                service.getCharacteristic(Characteristic.On)
                    .onGet(async () => {
                        const state = ssid.state;
                        if (this.logInfo) this.emit('message', `SSID: ${ssidName}, state: ${state ? 'Enabled' : 'Disabled'}`);
                        return state;
                    })
                    .onSet(async (state) => {
                        try {
                            state = state ? true : false;
                            await this.openWrt.send('ssid', ssidName, state);
                            if (this.logInfo) this.emit('message', `SSID: ${ssidName}, set State: ${state ? 'Enabled' : 'Disabled'}`);
                        } catch (error) {
                            this.emit('warn', `SSID: ${ssidName}, set state error: ${error}`);
                        }
                    });
                this.services.push(service);

                if (this.accessPoint.sensor) {
                    if (this.logDebug) this.emit('debug', `prepare ssid: ${ssidName} sensor service`);

                    this.sensorServices = [];
                    const sensorService = accessory.addService(Service.ContactSensor, ssidName, `sensorService${ssidName}`);
                    sensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    sensorService.setCharacteristic(Characteristic.ConfiguredName, ssidName);
                    sensorService.getCharacteristic(Characteristic.ContactSensorState)
                        .onGet(async () => {
                            const state = ssid.state;
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

            this.emit('devInfo', `-------- Switch ${this.name} --------`);
            this.emit('devInfo', `Name: ${this.openWrtInfo.systemInfo.hostname}`);
            this.emit('devInfo', `Model: ${this.openWrtInfo.systemInfo.model}`);
            this.emit('devInfo', `System: ${this.openWrtInfo.systemInfo.system}`);
            this.emit('devInfo', `Release: ${this.openWrtInfo.systemInfo.release?.description}`);
            this.emit('devInfo', `----------------------------------`);

            //denon client
            this.openWrt.on('systemInfo', (info) => {
                this.informationService?.updateCharacteristic(Characteristic.FirmwareRevision, info.release?.version);
            })
                .on('wirelessStatus', async (status) => {
                })
                .on('wirelessRadios', async (radios) => {
                })
                .on('ssids', async (ssids) => {
                    // sensors
                    for (let i = 0; i < ssids.length; i++) {
                        const ssid = ssids[i];

                        const name = ssid[i].name;
                        const state = ssid[i].state;
                        const serviceName = this.accessPoint.namePrefix ? `${this.name} ${name}` : name;
                        this.services?.[i]
                            ?.setCharacteristic(Characteristic.ConfiguredName, serviceName)
                            .updateCharacteristic(Characteristic.On, state);

                        this.sensorServices?.[i]
                            ?.setCharacteristic(Characteristic.ConfiguredName, name)
                            .updateCharacteristic(Characteristic.ContactSensorState, state ? 0 : 1);

                        if (this.logInfo) {
                            this.emit('info', `SSID name: ${ssid.name}`);
                            this.emit('info', `Name: ${ssid.state}`);
                            this.emit('info', `Mode: ${ssid.mode}`);
                        }
                    }
                })
                .on('restFul', (path, data) => {
                    if (this.restFulConnected) this.restFul1.update(path, data);
                })
                .on('mqtt', (topic, message) => {
                    if (this.mqttConnected) this.mqtt1.emit('publish', topic, message);
                });

            //prepare accessory
            const accessory = await this.prepareAccessory();
            return accessory;
        } catch (error) {
            throw new Error(`Start error: ${error}`);
        }
    }
};
export default SwitchDevice;
