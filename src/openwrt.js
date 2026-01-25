import EventEmitter from 'events';
import axios from 'axios';
import Functions from './functions.js';
import ImpulseGenerator from './impulsegenerator.js';
import { AclPath, AclData } from './constants.js';

class OpenWrt extends EventEmitter {
    constructor(config) {
        super();
        this.user = config.auth?.user || 'root';
        this.passwd = config.auth?.passwd;
        this.logError = config.log?.error;
        this.logDebug = config.log?.debug;

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
            const openWrtInfo = { state: false, info: '', linkUp: false, systemInfo: {}, networkInfo: {}, wirelessInfo: {}, wirelessRadios: [], wirelessSsids: [], switchPorts: [] };

            // System info
            const systemInfo = await this.ubusCall('system', 'board');
            if (this.logDebug) this.emit('debug', `System info data: ${JSON.stringify(systemInfo, null, 2)}`);

            // Link status
            const networkInterfaces = await this.ubusCall('network.interface', 'dump');
            if (this.logDebug) this.emit('debug', `Network interfaces data: ${JSON.stringify(networkInterfaces, null, 2)}`);
            const interfaces = networkInterfaces?.interface || [];
            const linkUp = interfaces.some(iface => {
                if (!iface?.up) return false;
                return ((Array.isArray(iface['ipv4-address']) && iface['ipv4-address'].length > 0) || (Array.isArray(iface['ipv6-address']) && iface['ipv6-address'].length > 0));
            });

            // Wireless info
            const wirelessInfo = await this.ubusCall('uci', 'get', { config: 'wireless' });
            if (this.logDebug) this.emit('debug', `Wireless status data: ${JSON.stringify(wirelessInfo, null, 2)}`);

            // Radios list
            const radios = Object.entries(wirelessInfo?.values || {}).filter(([, data]) => data['.type'] === 'wifi-device').map(([key, data]) => {
                const name = data.device || data['.name'] || key;
                const band = data.band ?? '';
                const disabled = data.disabled === '1';

                return {
                    name,
                    band,
                    disabled
                };
            });

            // SSIDs list
            const ssids = Object.entries(wirelessInfo?.values || {}).filter(([, data]) => data['.type'] === 'wifi-iface').map(([key, data]) => {
                // radio
                const currentRadio = radios.find(r => r.name === data.device);
                const radio = data.device || null;
                const band = currentRadio?.band ?? '';

                // ssid
                const name = data.ssid || null;
                const mode = data.mode || null;
                const hidden = data.hidden === '1' || data.hidden === true;
                const disabled = data.disabled === '1' || currentRadio?.disabled === true;

                return {
                    radio,
                    band,
                    name,
                    mode,
                    hidden,
                    disabled
                };
            });

            // Final object
            openWrtInfo.state = true;
            openWrtInfo.info = 'Connect Success';
            openWrtInfo.linkUp = linkUp;
            openWrtInfo.systemInfo = systemInfo;
            openWrtInfo.networkInfo = networkInterfaces;
            openWrtInfo.wirelessInfo = wirelessInfo;
            openWrtInfo.wirelessRadios = radios;
            openWrtInfo.wirelessSsids = ssids;
            
            this.emit('openWrtInfo', openWrtInfo);

            return openWrtInfo;
        } catch (error) {
            throw new Error(`Connect error: ${error.message}`);
        }
    }

    async send(type, radioName, ssidName, newSsidName = null, state, command, restart = false) {
        switch (type) {
            case 'router':
                break;
            case 'radio':
                await this.handleWithLock(async () => {
                    if (this.logDebug) this.emit('debug', `${restart ? 'Restart' : state ? 'Enabling' : 'Disabling'} radio ${radioName}`);

                    // Toggle radio
                    if (!restart) {
                        // Get wireless config with UCI
                        const wirelessConfig = await this.ubusCall('uci', 'get', { config: 'wireless' });

                        // Find radio device
                        const radioEntries = Object.entries(wirelessConfig.values || {}).filter(([, data]) => data['.type'] === 'wifi-device' && data['.name'] === radioName);

                        if (radioEntries.length === 0) {
                            throw new Error(`Radio ${radioName} not found`);
                        }

                        for (const [, radioData] of radioEntries) {
                            const section = radioData['.name'];

                            if (!section) {
                                if (this.logWarn) this.emit('warn', `Skipping radio ${radioName} (missing section)`);
                                continue;
                            }

                            await this.ubusCall('uci', 'set', { config: 'wireless', section, values: { disabled: state ? '0' : '1' } });
                        }

                        // Commit
                        await this.ubusCall('uci', 'commit', { config: 'wireless' });
                        if (this.logDebug) this.emit('debug', `Send radio ${radioName} ${state ? 'enabled' : 'disabled'}`);
                    }

                    // Reload
                    await this.ubusCall('network.wireless', 'down', { device: radioName });
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    await this.ubusCall('network.wireless', 'up', { device: radioName });
                    if (this.logDebug) this.emit('debug', `Radio ${radioName} restarted`);
                });
                break;
            case 'ssid':
                await this.handleWithLock(async () => {
                    if (this.logDebug) this.emit('debug', `${state ? 'Enabling' : 'Disabling'} SSID ${ssidName} on ${radioName}`);

                    // Get wireless config with  UCI
                    const wirelessConfig = await this.ubusCall('uci', 'get', { config: 'wireless' });

                    // Compare and select interface
                    const ifaceEntries = Object.entries(wirelessConfig.values || {}).filter(([, data]) => data['.type'] === 'wifi-iface' && data.ssid === ssidName && data.device === radioName);
                    if (ifaceEntries.length === 0) {
                        throw new Error(`SSID ${ssidName} not found on radio ${radioName}`);
                    }

                    for (const [, ifaceData] of ifaceEntries) {
                        const section = ifaceData['.name'];

                        if (!section) {
                            if (this.logWarn) this.emit('warn', `Skipping SSID ${ssidName} on ${radioName} (missing section)`);
                            continue;
                        }

                        ssidName = newSsidName && (ssidName !== newSsidName) ? newSsidName : ssidName;
                        await this.ubusCall('uci', 'set', { config: 'wireless', section, values: { ssid: ssidName, disabled: state ? '0' : '1' } });
                    }

                    // Commit
                    await this.ubusCall('uci', 'commit', { config: 'wireless' });
                    if (this.logDebug) this.emit('debug', `Send SSID ${ssidName} on ${radioName} ${state ? 'enabled' : 'disabled'}`);

                    // Reload
                    await this.ubusCall('network.wireless', 'down', { device: radioName });
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    await this.ubusCall('network.wireless', 'up', { device: radioName });
                    if (this.logDebug) this.emit('debug', `Radio ${radioName} restarted`);
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
                    case 2: //Wireless reload
                        await this.ubusCall('network.wireless', 'reload');
                        break;
                    default:
                        break;
                }
                break;
            case 'externalIntegration':
                switch (command) {
                    case 0: //System reboot
                        await this.ubusCall('system', 'reboot');
                        break;
                    case 1: //Network reload
                        await this.ubusCall('network', 'reload');
                        break;
                    case 2: //Wireless reload
                        await this.ubusCall('network.wireless', 'reload');
                        break;
                    default:
                        break;
                }
                break;
            default:
                if (this.logWarn) this.emit('warn', `Unknown send type: ${type}`);
                break;
        }
        return true;
    }
}

export default OpenWrt;