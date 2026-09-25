import EventEmitter from 'events';
import axios from 'axios';
import ImpulseGenerator from './impulsegenerator.js';

class OpenWrt extends EventEmitter {
    constructor(config) {
        super();
        this.user = config.auth?.user || 'root';
        this.passwd = config.auth?.passwd;
        this.logWarn = config.log?.warn;
        this.logError = config.log?.error;
        this.logDebug = config.log?.debug;

        this.lock = false;
        this.sessionId = null;

        // Home Assistant discovery needs more data (system, radio channel and power, clients), read at most every 30 s
        this.haDiscovery = config.mqtt?.enable === true && config.mqtt?.haDiscovery === true;
        this.extendedInfo = null;
        this.extendedInfoAt = 0;
        this.sessionExpiresAt = 0;

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

    // Commands wait for a running poll instead of being dropped, errors are reported like the poll errors
    async runExclusive(fn) {
        while (this.lock) await new Promise(resolve => setTimeout(resolve, 100));
        this.lock = true;

        try {
            await fn();
        } catch (error) {
            this.emit('error', `Send error: ${error.message}`);
        } finally {
            this.lock = false;
        }
    }

    // Read the state now, used after a command so Home Assistant does not wait for the next poll
    async refresh() {
        await this.handleWithLock(async () => {
            this.extendedInfoAt = 0;
            await this.connect();
        });
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
            const openWrtInfo = { state: false, info: '', linkUp: false, wan: null, systemInfo: {}, networkInfo: {}, wirelessInfo: {}, wirelessRadios: [], wirelessSsids: [], switchPorts: [], extendedInfo: null };

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

            // WAN interface, routers without an interface named wan (access points) have none
            const wanIface = interfaces.find(iface => iface?.interface === 'wan');
            const wan = wanIface ? { up: wanIface.up === true, ipv4: wanIface['ipv4-address']?.[0]?.address ?? null } : null;

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
                    section: data['.name'] || key,
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
                    section: data['.name'] || key,
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
            openWrtInfo.wan = wan;
            openWrtInfo.systemInfo = systemInfo;
            openWrtInfo.networkInfo = networkInterfaces;
            openWrtInfo.wirelessInfo = wirelessInfo;
            openWrtInfo.wirelessRadios = radios;
            openWrtInfo.wirelessSsids = ssids;
            if (this.haDiscovery) openWrtInfo.extendedInfo = await this.getExtendedInfo();
            
            this.emit('openWrtInfo', openWrtInfo);

            return openWrtInfo;
        } catch (error) {
            throw new Error(`Connect error: ${error.message}`);
        }
    }

    // System info, radio channel and power, clients per SSID. Every call is optional, a router without iwinfo or
    // without the ACL for it still reports the rest. Cached for 30 s, the calls per interface are not needed every poll
    async getExtendedInfo() {
        const now = Date.now();
        if (this.extendedInfo && now - this.extendedInfoAt < 30_000) return this.extendedInfo;

        const optional = async (service, method, params) => {
            try {
                return await this.ubusCall(service, method, params);
            } catch (error) {
                if (this.logDebug) this.emit('debug', `Optional ubus call ${service} ${method} failed: ${error.message}`);
                return null;
            }
        };

        const info = { system: null, radios: {}, ifaces: {} };

        const system = await optional('system', 'info');
        if (system) {
            const memory = system.memory ?? {};
            const available = memory.available ?? ((memory.free ?? 0) + (memory.buffered ?? 0) + (memory.cached ?? 0));
            info.system = {
                uptime: system.uptime ?? null,
                load: Array.isArray(system.load) ? Math.round(system.load[0] / 65536 * 100) / 100 : null,
                memory: memory.total ? Math.round((1 - available / memory.total) * 100) : null
            };
        }

        // Interface names of the SSID sections, from the runtime wireless status
        const status = await optional('network.wireless', 'status');
        for (const [radio, radioStatus] of Object.entries(status ?? {})) {
            const radioInfo = { up: radioStatus?.up === true, channel: null, txpower: null };
            for (const iface of radioStatus?.interfaces ?? []) {
                if (!iface?.section || !iface?.ifname) continue;
                const clients = await optional('iwinfo', 'assoclist', { device: iface.ifname });
                info.ifaces[iface.section] = { ifname: iface.ifname, clients: Array.isArray(clients?.results) ? clients.results.length : null };

                // Channel and power of the radio from its first interface
                if (radioInfo.channel === null) {
                    const ifaceInfo = await optional('iwinfo', 'info', { device: iface.ifname });
                    radioInfo.channel = ifaceInfo?.channel ?? null;
                    radioInfo.txpower = ifaceInfo?.txpower ?? null;
                }
            }
            info.radios[radio] = radioInfo;
        }

        if (this.logDebug) this.emit('debug', `Extended info: ${JSON.stringify(info)}`);
        this.extendedInfo = info;
        this.extendedInfoAt = now;
        return info;
    }

    async send(type, radioName, ssidName, newSsidName = null, state, command, restart = false) {
        switch (type) {
            case 'router':
                break;
            case 'radio':
                await this.runExclusive(async () => {
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
                await this.runExclusive(async () => {
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