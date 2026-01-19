import EventEmitter from 'events';
import RestFul from './restful.js';
import Mqtt from './mqtt.js';
let Accessory, Characteristic, Service, Categories, AccessoryUUID;

class AccessPoint extends EventEmitter {
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
        this.name = config.apDevice?.name || `Access Point ${openWrtInfo.systemInfo.hostname}`;
        this.namePrefix = config.apDevice?.namePrefix || false;
        this.control = config.apDevice?.control || {};
        this.sensor = config.apDevice?.sensor || {};
        this.buttons = (config.buttons ?? []).filter(button => (button.displayType ?? 0) > 0);
        this.logDeviceInfo = config.log?.deviceInfo || false;
        this.logInfo = config.log?.info || false;
        this.logDebug = config.log?.debug || false;

        //external integration
        this.restFul = config.restFul || {};
        this.restFulConnected = false;
        this.mqtt = config.mqtt || {};
        this.mqttConnected = false;

        //buttons
        for (const button of this.buttons) {
            button.serviceType = ['', Service.Outlet, Service.Switch][button.displayType];
            button.state = false;
        }

        //openwrt
        this.openWrt = openWrt;
        this.openWrtInfo = openWrtInfo;

        //openwrt client
        openWrt.on('openWrtInfo', (openWrtInfo) => {
            this.informationService?.updateCharacteristic(Characteristic.FirmwareRevision, openWrtInfo.systemInfo.release?.version);

            // update state
            const ssids = openWrtInfo.wirelessSsids;
            for (let i = 0; i < ssids.length; i++) {
                const radio = ssids[i].device;
                const frequency = ssids[i].frequency;
                const name = ssids[i].name;
                const state = ssids[i].disabled;

                //controls
                if (this.control.displayType > 0) {
                    const serviceName = this.control.namePrefix ? `${this.name} ${name} ${frequency}` : `${name} ${frequency}`;
                    const characteristicType = [null, Characteristic.On, Characteristic.On, Characteristic.On][this.control.displayType];
                    this.services?.[i]
                        ?.setCharacteristic(Characteristic.ConfiguredName, serviceName)
                        .updateCharacteristic(characteristicType, !state);
                }

                //sensors
                if (this.sensor.displayType > 0) {
                    const characteristicType = [null, Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][this.sensor.displayType];
                    const serviceName = this.sensor.namePrefix ? `${this.name} ${name} ${frequency}` : `${name} ${frequency}`;
                    this.sensorServices?.[i]
                        ?.setCharacteristic(Characteristic.ConfiguredName, serviceName)
                        .updateCharacteristic(characteristicType, !state);
                }

                //buttons
                if (this.buttons.length > 0) {
                    for (let i = 0; i < this.buttons.length; i++) {
                        const button = this.buttons[i];
                        const state = false;
                        button.state = state;
                        this.buttonServices?.[i]?.updateCharacteristic(Characteristic.On, state);
                    };
                }

                if (this.logInfo) {
                    this.emit('info', `Radio: ${radio}`);
                    this.emit('info', `Frequency: ${frequency}`);
                    this.emit('info', `Name: ${name}`);
                    this.emit('info', `State: ${state}`);
                    this.emit('info', `Mode: ${ssids[i].mode}`);
                }
            }

            //restFul and mqtt
            if (this.restFulConnected) this.restFul1.update('info', openWrtInfo);
            if (this.mqttConnected) this.mqtt1.emit('publish', 'Info', openWrtInfo);
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
                case 'SystemReboot':
                    set = value ? await this.openWrt.send('button', null, null, 0) : false;
                    break;
                case 'NetworkReload':
                    set = value ? await this.openWrt.send('button', null, null, 1) : false;
                    break;
                case 'WiFiReload':
                    set = value ? await this.openWrt.send('button', null, null, 2) : false;
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

            //ssids controls
            for (const ssid of this.openWrtInfo.wirelessSsids) {
                const radio = ssid.device; //radio name
                const frequency = ssid.frequency; //frequency
                const name = ssid.name; //ssid name

                if (this.control.displayType > 0) {
                    if (this.logDebug) this.emit('debug', `prepare ssid: ${name} ${radio} service`);

                    const serviceType = [null, Service.Switch, Service.Outlet, Service.Lightbulb][this.control.displayType];
                    const serviceName = this.control.namePrefix ? `${accessoryName} ${name} ${frequency}` : `${name} ${frequency}`;
                    const service = accessory.addService(serviceType, serviceName, `service${name}${radio}`);
                    service.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    service.setCharacteristic(Characteristic.ConfiguredName, serviceName);
                    service.getCharacteristic(Characteristic.On)
                        .onGet(async () => {
                            const state = !ssid.disabled;
                            if (this.logInfo) this.emit('message', `SSID: ${name}, radio: ${radio}, state: ${state ? 'Enabled' : 'Disabled'}`);
                            return state;
                        })
                        .onSet(async (state) => {
                            try {
                                await this.openWrt.send('apDevice', radio, name, state);
                                if (this.logInfo) this.emit('message', `SSID: ${name}, radio: ${radio}, set State: ${state ? 'Enabled' : 'Disabled'}`);
                            } catch (error) {
                                this.emit('warn', `SSID: ${name}, radio: ${radio}, set state error: ${error}`);
                            }
                        });
                    this.services.push(service);
                }

                //ssids sensors
                if (this.sensor.displayType > 0) {
                    if (this.logDebug) this.emit('debug', `prepare ssid: ${name} ${radio} sensor service`);

                    const serviceType = [null, Service.MotionSensor, Service.OccupancySensor, Service.ContactSensor][this.sensor.displayType];
                    const serviceName = this.sensor.namePrefix ? `${accessoryName} ${name} ${frequency}` : `${name} ${frequency}`;
                    const sensorService = accessory.addService(serviceType, serviceName, `sensorService${name}${radio}`);
                    sensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    sensorService.setCharacteristic(Characteristic.ConfiguredName, serviceName);
                    sensorService.getCharacteristic(Characteristic.ContactSensorState)
                        .onGet(async () => {
                            const state = !ssid.disabled;
                            return state;
                        });
                    this.sensorServices.push(sensorService);
                }
            }

            //prepare button services
            if (this.buttons.length > 0) {
                const possibleButtonsCount = 99 - accessory.services.length;
                const maxButtonsCount = this.buttons.length >= possibleButtonsCount ? possibleButtonsCount : this.buttons.length;
                if (maxButtonsCount > 0) {
                    this.buttonServices = [];
                    if (this.logDebug) this.emit('debug', `Prepare buttons services`);
                    for (let i = 0; i < maxButtonsCount; i++) {
                        const button = this.buttons[i];

                        //get button name
                        const name = button.name || `Button ${i}`;

                        //get button command
                        const command = button.command;

                        //get button name prefix
                        const namePrefix = button.namePrefix;

                        //get service type
                        const serviceType = button.serviceType;

                        const serviceName = namePrefix ? `${accessoryName} ${name}` : name;
                        const buttonService = new serviceType(serviceName, `Button ${i}`);
                        buttonService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        buttonService.setCharacteristic(Characteristic.ConfiguredName, serviceName);
                        buttonService.getCharacteristic(Characteristic.On)
                            .onGet(async () => {
                                const state = button.state;
                                return state;
                            })
                            .onSet(async (state) => {
                                if (!state) return;

                                try {
                                    if (this.power) await this.openWrt.send('button', null, null, command);
                                    if (this.logDebug) this.emit('debug', `Set command ${name}`);
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `Set command ${name} error: ${error}`);
                                }
                            });
                        this.buttonServices.push(buttonService);
                        accessory.addService(buttonService);
                    }
                }
            }

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
                this.emit('devInfo', `SSIDs: ${this.openWrtInfo.wirelessSsids.length}`);
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
export default AccessPoint;
