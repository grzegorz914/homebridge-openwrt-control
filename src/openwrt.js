import EventEmitter from 'events';
import axios from 'axios';
import Functions from './functions.js';
import ImpulseGenerator from './impulsegenerator.js';

class OpenWrt extends EventEmitter {
    constructor(config) {
        super();

        this.user = config.auth?.user || 'root';
        this.passwd = config.auth?.passwd;
        this.logError = config.log?.error;
        this.logDebug = config.log?.debug;

        //external integration
        this.restFulEnabled = config.restFul?.enable || false;
        this.mqttEnabled = config.mqtt?.enable || false;

        this.lock = false;
        this.sessionId = null;
        this.sessionExpiresAt = 0;

        this.functions = new Functions();

        const baseUrl = `http://${config.host}/ubus`;
        this.axiosInstance = axios.create({
            baseURL: baseUrl,
            timeout: 5000,
            headers: {
                "Content-Type": "application/json"
            }
        });

        this.impulseGenerator = new ImpulseGenerator()
            .on('connect', () => this.handleWithLock(async () => {
                await this.connect();
            }))
            .on('state', (state) => {
                this.emit(state ? 'success' : 'warn', `Impulse generator ${state ? 'started' : 'stopped'}`);
            });
    }

    async handleWithLock(fn) {
        if (this.lock) return;
        this.lock = true;

        try {
            await fn();
        } catch (error) {
            this.emit('error', `Impulse generator error: ${error.message}`);
        } finally {
            this.lock = false;
        }
    }

    async login() {
        const now = Date.now();
        if (this.sessionId && now < this.sessionExpiresAt) {
            return this.sessionId;
        }

        const response = await this.axiosInstance.post('', {
            jsonrpc: '2.0',
            id: 1,
            method: 'call',
            params: ['00000000000000000000000000000000', 'session', 'login', { username: this.user, password: this.passwd }]
        });

        const result = response.data?.result?.[1];
        if (!result?.ubus_rpc_session) throw new Error('Ubus login failed');

        this.sessionId = result.ubus_rpc_session;
        this.sessionExpiresAt = now + 240_000;

        if (this.logDebug) this.emit('debug', `Ubus login OK`);
        return this.sessionId;
    }

    async ubusCall(service, method, params = {}) {
        const session = await this.login();
        const response = await this.axiosInstance.post('', {
            jsonrpc: '2.0',
            id: 2,
            method: 'call',
            params: [session, service, method, params]
        });

        if (response.data?.error) throw new Error(response.data.error.message || 'Ubus call error');

        return response.data.result[1];
    }

    async connect() {
        try {
            const openWrtInfo = { state: false, info: '', systemInfo: {}, networkInfo: {}, wirelessInfo: {}, wirelessRadios: [], wirelessSsids: [], switchPorts: [] };

            // System info
            const systemInfo = await this.ubusCall('system', 'board');
            if (this.logDebug) this.emit('debug', `System info data: ${JSON.stringify(systemInfo, null, 2)}`);

            // Wireless UCI
            const wirelessInfo = await this.ubusCall('uci', 'get', { config: 'wireless' });
            if (this.logDebug) this.emit('debug', `Wireless status data: ${JSON.stringify(wirelessInfo, null, 2)}`);

            // Radio -> band map
            const radioBandMap = Object.entries(wirelessInfo?.values || {})
                .filter(([, data]) => data['.type'] === 'wifi-device')
                .reduce((map, [, data]) => {
                    if (data.band === '2g') map[data['.name']] = '2.4GHz';
                    else if (data.band === '5g') map[data['.name']] = '5GHz';
                    else map[data['.name']] = 'unknown';
                    return map;
                }, {});

            // Radios list
            const radios = Object.entries(wirelessInfo?.values || {})
                .filter(([, data]) => data['.type'] === 'wifi-device')
                .map(([key, data]) => {
                    const deviceName = data.device || data['.name'] || key;
                    const band = radioBandMap[deviceName] || 'unknown';
                    const disabled = data.disabled === '1';

                    return {
                        device: deviceName,
                        band,
                        disabled
                    };
                });

            // Radio disabled map
            const radioDisabledMap = radios.reduce((map, radio) => {
                map[radio.device] = radio.disabled;
                return map;
            }, {});

            // SSIDs list
            const ssids = Object.entries(wirelessInfo?.values || {})
                .filter(([, data]) => data['.type'] === 'wifi-iface')
                .map(([key, data]) => {
                    const ifaceName = data['.name'] || key;
                    const radioName = data.device || null;
                    const band = radioBandMap[radioName] || 'unknown';
                    const disabled = data.disabled === '1';

                    return {
                        ifname: ifaceName,
                        device: radioName,
                        band,
                        name: data.ssid || null,
                        mode: data.mode || null,
                        hidden: data.hidden === '1' || data.hidden === true,
                        disabled
                    };
                });

            // Apply radio disabled -> SSID disabled
            const normalizedSsids = ssids.map(ssid => {
                const radioDisabled = radioDisabledMap[ssid.device] === true;
                return {
                    ...ssid,
                    disabled: ssid.disabled || radioDisabled
                };
            });

            // Final object
            openWrtInfo.state = true;
            openWrtInfo.info = 'Connect Success';
            openWrtInfo.systemInfo = systemInfo;
            openWrtInfo.wirelessInfo = wirelessInfo;
            openWrtInfo.wirelessRadios = radios;
            openWrtInfo.wirelessSsids = normalizedSsids;

            this.emit('openWrtInfo', openWrtInfo);

            return openWrtInfo;
        } catch (error) {
            throw new Error(`Connect error: ${error.message}`);
        }
    }


    async send(type, radio, name, state, command) {
        switch (type) {
            case 'router':
                break;
            case 'radio':
                await this.handleWithLock(async () => {
                    if (this.logDebug) this.emit('debug', `${state ? 'Enabling' : 'Disabling'} radio ${name}`);

                    // Get wireless config with UCI
                    const wirelessConfig = await this.ubusCall('uci', 'get', { config: 'wireless' });

                    // Find radio device
                    const radioEntries = Object.entries(wirelessConfig.values || {}).filter(([, data]) => data['.type'] === 'wifi-device' && data['.name'] === name);

                    if (radioEntries.length === 0) {
                        throw new Error(`Radio ${name} not found`);
                    }

                    for (const [, radioData] of radioEntries) {
                        const section = radioData['.name'];

                        if (!section) {
                            if (this.logWarn) this.emit('warn', `Skipping radio ${name} (missing section)`);
                            continue;
                        }

                        await this.ubusCall('uci', 'set', { config: 'wireless', section, values: { disabled: state ? '0' : '1' } });
                    }

                    // Commit + reload
                    await this.ubusCall('uci', 'commit', { config: 'wireless' });
                    await this.ubusCall('network.wireless', 'reload');

                    if (this.logDebug) this.emit('debug', `Send radio ${name} ${state ? 'enabled' : 'disabled'}`);
                });
                break;
            case 'ssid':
                await this.handleWithLock(async () => {
                    if (this.logDebug) this.emit('debug', `${state ? 'Enabling' : 'Disabling'} SSID ${name} on ${radio}`);

                    // Get wireless config with  UCI
                    const wirelessConfig = await this.ubusCall('uci', 'get', { config: 'wireless' });

                    // Compare and select interface
                    const ifaceEntries = Object.entries(wirelessConfig.values || {}).filter(([, data]) => data['.type'] === 'wifi-iface' && data.ssid === name && data.device === radio);
                    if (ifaceEntries.length === 0) {
                        throw new Error(`SSID ${name} not found on radio ${radio}`);
                    }

                    for (const [, ifaceData] of ifaceEntries) {
                        const section = ifaceData['.name'];

                        if (!section) {
                            if (this.logWarn) this.emit('warn', `Skipping SSID ${name} on ${radio} (missing section)`);
                            continue;
                        }

                        await this.ubusCall('uci', 'set', { config: 'wireless', section, values: { disabled: state ? '0' : '1' } });
                    }

                    // Commit + reload
                    await this.ubusCall('uci', 'commit', { config: 'wireless' });
                    await this.ubusCall('network.wireless', 'reload');
                    if (this.logDebug) this.emit('debug', `Send SSID ${name} on ${radio} ${state ? 'enabled' : 'disabled'}`);
                });
                break;
            case 'button':
                switch (command) {
                    case 0: //System reboot
                        await this.ubusCall('system', 'reboot');
                        break;
                    case 1: //Network reload
                        await this.ubusCall('network', 'reload');
                        break;
                    case 2: //WiFi reload
                        await this.ubusCall('network.wireless', 'reload');
                        break;
                    default:
                        break;
                }
                break;
            default:
                break;
        }
        return true;
    }
}

export default OpenWrt;