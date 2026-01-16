import EventEmitter from "events";
import axios from "axios";
import Functions from './functions.js';
import ImpulseGenerator from "./impulsegenerator.js";

class OpenWrt extends EventEmitter {
    constructor(config) {
        super();

        this.name = config.name;
        this.host = config.host;
        this.user = config.user;
        this.passwd = config.passwd;
        this.logDebug = config.logDebug;

        //external integration
        this.restFulEnabled = config.restFul?.enable || false;
        this.mqttEnabled = config.mqtt?.enable || false;

        this.firstRun = true;
        this.lock = false;

        this.sessionId = null;
        this.sessionExpiresAt = 0;

        this.functions = new Functions();
        this.axiosInstance = axios.create({
            baseURL: `${config.host}/ubus`,
            timeout: 5000,
            headers: {
                "Content-Type": "application/json"
            }
        });

        this.impulseGenerator = new ImpulseGenerator()
            .on("connect", () => this.handleWithLock(async () => {
                await this.connect();
            }))
            .on("state", (state) => {
                this.emit(state ? "success" : "warn", `Impulse generator ${state ? "started" : "stopped"}`);
            });
    }

    async handleWithLock(fn) {
        if (this.lock) return;
        this.lock = true;

        try {
            await fn();
        } catch (error) {
            this.emit("error", `Impulse generator error: ${error.message}`
            );
        } finally {
            this.lock = false;
        }
    }

    async login() {
        const now = Date.now();
        if (this.sessionId && now < this.sessionExpiresAt) {
            return this.sessionId;
        }

        const response = await this.axiosInstance.post("", {
            jsonrpc: "2.0",
            id: 1,
            method: "call",
            params: ["00000000000000000000000000000000", "session", "login", { username: this.user, password: this.passwd }]
        });

        const result = response.data?.result?.[1];
        if (!result?.ubus_rpc_session) {
            throw new Error("ubus login failed");
        }

        this.sessionId = result.ubus_rpc_session;
        this.sessionExpiresAt = now + 240_000;

        if (this.logDebug) this.emit("debug", `Ubus login OK`);
        return this.sessionId;
    }

    async ubusCall(service, method, params = {}) {
        const session = await this.login();

        const response = await this.axiosInstance.post("", {
            jsonrpc: "2.0",
            id: 2,
            method: "call",
            params: [session, service, method, params]
        });

        if (response.data?.error) {
            throw new Error(response.data.error.message || "ubus call error");
        }

        return response.data.result[1];
    }

    async connect() {
        const openWrtInfo = { state: false, systemInfo: {}, wirelessStatus: {}, wirelessRadios: [], ssids: [] }
        const systemInfo = await this.ubusCall("system", "board");
        const wirelessStatus = await this.ubusCall("network.wireless", "status");
        if (this.logDebug) this.emit("debug", `Status data: ${JSON.stringify(wirelessStatus, null, 2)}`);

        const wirelessRadios = Object.values(status.radios).map(radio => ({
            name: radio.name,
            state: radio.up === true,
            interfaces: Object.values(radio.interfaces).map(i => ({
                name: i.ssid,
                state: i.up === true,
                mode: i.mode
            }))
        }));

        const ssids = openWrtInfo.wirelessRadios.flatMap(radio => radio.interfaces);
        this.emit("systemInfo", systemInfo);
        this.emit("wirelessStatus", wirelessStatus);
        this.emit("wirelessRadios", wirelessRadios);
        this.emit("ssids", ssids);

        if (this.firstRun) {
            this.emit("success", `Connect success`);
            this.firstRun = false;
        }

        openWrtInfo.state = true;
        openWrtInfo.systemInfo = systemInfo;
        openWrtInfo.wirelessStatus = wirelessStatus;
        openWrtInfo.wirelessRadios = wirelessRadios;
        openWrtInfo.ssids = ssids;

        if (this.logDebug) this.emit("debug", `OpenWrt Data: ${JSON.stringify(openWrtInfo, null, 2)}`);
        return openWrtInfo;
    }

    async send(type, ssidName, state) {
        switch (type) {
            case 'ssid':
                await this.handleWithLock(async () => {
                    if (this.logDebug) this.emit("debug", `${state ? "Enabling" : "Disabling"} SSID ${ssidName}`);

                    const status = await this.ubusCall("network.wireless", "status");
                    const iface = await this.functions.findIfaceBySsid(status, ssidName);
                    if (!iface) throw new Error(`SSID ${ssidName} not found`);

                    const section = iface.section;
                    if (!section) throw new Error(`No UCI section for SSID ${ssidName}`);

                    await this.ubusCall("uci", "set",
                        {
                            config: "wireless",
                            section: section,
                            values: {
                                disabled: state ? "0" : "1"
                            }
                        }
                    );

                    await this.ubusCall("uci", "commit", { config: "wireless" });
                    await this.ubusCall("network.wireless", "reload", {});

                    this.emit("success", `SSID ${ssidName} ${state ? "enabled" : "disabled"}`);
                });
                break;
            case 'switch':
                break;
        }
    }
}

export default OpenWrt;

