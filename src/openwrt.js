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
            const openWrtInfo = { state: false, info: '', systemInfo: {}, networkInfo: {}, wirelessStatus: {}, wirelessRadios: [], ssids: [] }
            const systemInfo = await this.ubusCall('system', 'board');
            if (this.logDebug) this.emit('debug', `System info data: ${JSON.stringify(systemInfo, null, 2)}`);

            //const networkInfo = await this.ubusCall('network.device', 'status', '{ "name": "eth0" }');
            //const networkInfo = await this.ubusCall('file', 'read', { path: '/sys/class/net/eth0/address' });
            //if (this.logDebug) this.emit('debug', `Network info data: ${networkInfo}`);

            //const wirelessStatus = await this.ubusCall('network.wireless', 'status');
            const wirelessStatus = await this.ubusCall('uci', 'get', { config: 'wireless' });
            if (this.logDebug) this.emit('debug', `Wireless status data: ${JSON.stringify(wirelessStatus, null, 2)}`);

            //const wirelessRadios = Object.values(wirelessStatus.radios).map(radio => ({
            //name: radio.name,
            //state: radio.up === true,
            //interfaces: Object.values(radio.interfaces).map(i => ({
            //name: i.ssid,
            //state: i.up === true,
            //mode: i.mode
            //}))
            //}));

            //const ssids = wirelessRadios.flatMap(radio => radio.interfaces);
            const ssids = Object.entries(wirelessStatus.values || {}).flatMap(([key, data]) => {
                if (!key.startsWith('wifinet') && !key.startsWith('default_radio')) return [];
                return [{
                    ifname: data['.name'] || key,
                    name: data.ssid || null,
                    device: data.device || null,
                    mode: data.mode || null,
                    hidden: data.hidden === '1' || data.hidden === true,
                    state: true
                }];
            });
            if (ssids.length === 0) {
                openWrtInfo.info = 'SSIDs not found';
                return openWrtInfo;
            }

            openWrtInfo.state = true;
            openWrtInfo.info = `Connect Success`;
            openWrtInfo.systemInfo = systemInfo;
            //openWrtInfo.networkInfo = networkInfo;
            openWrtInfo.wirelessStatus = wirelessStatus;
            //openWrtInfo.wirelessRadios = wirelessRadios;
            openWrtInfo.ssids = ssids;

            // emit data
            this.emit('openWrtInfo', openWrtInfo);

            return openWrtInfo;
        } catch (error) {
            throw new Error(`Connect error: ${error.message}`);
        }
    }

    async send(type, ssidName, state) {
        switch (type) {
            case 'ssid':
                await this.handleWithLock(async () => {
                    if (this.logDebug) this.emit('debug', `${state ? 'Enabling' : 'Disabling'} SSID ${ssidName}`);

                    const status = await this.ubusCall('network.wireless', 'status');
                    const iface = await this.functions.findIfaceBySsid(status, ssidName);
                    if (!iface) throw new Error(`SSID ${ssidName} not found`);

                    const section = iface.section;
                    if (!section) throw new Error(`No UCI section for SSID ${ssidName}`);

                    await this.ubusCall('uci', 'set',
                        {
                            config: 'wireless',
                            section: section,
                            values: {
                                disabled: state ? '0' : '1'
                            }
                        }
                    );

                    await this.ubusCall('uci', 'commit', { config: 'wireless' });
                    await this.ubusCall('network.wireless', 'reload', {});

                    if (this.logDebug) this.emit('debug', `Send SSID ${ssidName} ${state ? 'enabled' : 'disabled'}`);
                });
                break;
            case 'switch':
                break;
        }
    }
}

export default OpenWrt;