import { readFileSync, writeFileSync } from 'fs';
import qrcode from 'qrcode-generator';

// SSIDs are UTF-8, the library encodes single bytes by default
qrcode.stringToBytes = (text) => [...Buffer.from(text, 'utf8')];

// Home Assistant MQTT discovery, native switch / binary_sensor / sensor / button / image entities.
// Commands go back to the existing <prefix>/Set topic as the JSON keys the plugin handles.
const BandLabel = { '2g': '2.4 GHz', '5g': '5 GHz', '6g': '6 GHz', '60g': '60 GHz' };

class HaDiscovery {
    constructor(mqtt, config) {
        // + and # are MQTT wildcards, Home Assistant would subscribe to a pattern instead of the device topic
        if (/[+#]/.test(mqtt.config.prefix)) {
            throw new Error(`MQTT prefix ${mqtt.config.prefix} must not contain + or #, rename the device or set a prefix`);
        }

        this.mqtt = mqtt;
        this.baseId = `openwrt_${String(config.host).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        this.stateTopic = `${mqtt.config.prefix}/HA State`;
        this.commandTopic = `${mqtt.config.prefix}/Set`;
        this.wifiQr = config.wifiQr === true;
        this.device = {
            identifiers: [this.baseId],
            name: config.name,
            manufacturer: config.manufacturer || 'OpenWrt',
            ...(config.model ? { model: String(config.model) } : {}),
            ...(config.swVersion ? { sw_version: String(config.swVersion) } : {}),
            configuration_url: `http://${config.host}`
        };
        this.origin = { name: 'homebridge-openwrt-control', support_url: 'https://github.com/grzegorz914/homebridge-openwrt-control' };

        // Topics published before a restart, entities that no longer exist are removed on the first sync
        this.topicsFile = config.topicsFile;
        this.knownTopics = new Set();
        try {
            for (const topic of JSON.parse(readFileSync(this.topicsFile, 'utf8'))) this.knownTopics.add(topic);
        } catch {
            // first start, nothing published yet
        }

        this.lastConfig = {};
        this.lastState = '';
        this.lastImage = {};
        this.bootTime = null;

        // Sensors stay once their data was seen, a disabled radio reports no clients or channel for a while
        // and removing the entity would break the history and dashboards in Home Assistant
        this.seen = new Set();
        for (const topic of this.knownTopics) {
            const suffix = topic.split('/').at(-2)?.slice(this.baseId.length + 1);
            if (suffix) this.seen.add(suffix);
        }
    }

    has(suffix, available) {
        if (available) this.seen.add(suffix);
        return this.seen.has(suffix);
    }

    // Publish all entities of the router, remove the ones that disappeared (SSID deleted, QR code disabled)
    async sync(info) {
        const { entities, images } = this.build(info);

        const current = new Set();
        for (const { component, suffix, entity } of entities) {
            current.add(await this.publishEntity(component, suffix, entity));
        }

        for (const topic of this.knownTopics) {
            if (current.has(topic)) continue;
            await this.mqtt.publishRetained(topic, '');
            delete this.lastConfig[topic];
        }
        for (const [topic, image] of Object.entries(images)) {
            await this.updateImage(topic, image);
        }
        for (const topic of Object.keys(this.lastImage)) {
            if (!(topic in images)) await this.updateImage(topic, null);
        }

        const changed = current.size !== this.knownTopics.size || [...current].some(topic => !this.knownTopics.has(topic));
        this.knownTopics = current;
        if (changed && this.topicsFile) {
            try {
                writeFileSync(this.topicsFile, JSON.stringify([...current], null, 2));
            } catch {
                // not critical, stale entities stay until removed in Home Assistant
            }
        }

        await this.updateState(this.state(info));
    }

    // Publish (or republish when changed) one retained discovery message, returns its topic
    async publishEntity(component, suffix, entity) {
        const objectId = `${this.baseId}_${suffix}`;
        const topic = `${this.mqtt.haPrefix}/${component}/${objectId}/config`;
        const config = {
            unique_id: objectId,
            has_entity_name: true,
            device: this.device,
            origin: this.origin,
            availability_topic: this.mqtt.availabilityTopic,
            ...entity
        };

        const payload = JSON.stringify(config);
        if (this.lastConfig[topic] !== payload) {
            this.lastConfig[topic] = payload;
            await this.mqtt.publishRetained(topic, payload);
        }
        return topic;
    }

    async updateState(state) {
        const payload = JSON.stringify(state);
        if (payload === this.lastState) return false;
        this.lastState = payload;
        await this.mqtt.publishRetained(this.stateTopic, payload);
        return true;
    }

    // Retained image payload, an empty payload clears the topic
    async updateImage(topic, image) {
        if (this.lastImage[topic] === image) return false;
        if (image === null) delete this.lastImage[topic];
        else this.lastImage[topic] = image;
        await this.mqtt.publishRetained(topic, image ?? '');
        return true;
    }

    // ---------------------------------------------------------------- entities
    build(info) {
        const ext = info.extendedInfo ?? {};
        const system = ext.system ?? {};
        const entities = [];
        const images = {};
        const state = (path) => `{{ value_json${path} }}`;
        const sensor = (suffix, entity) => entities.push({ component: 'sensor', suffix, entity: { state_topic: this.stateTopic, ...entity } });
        const button = (suffix, payload, entity) => entities.push({ component: 'button', suffix, entity: { command_topic: this.commandTopic, payload_press: JSON.stringify(payload), ...entity } });
        const toggle = (suffix, id, key, entity) => entities.push({
            component: 'switch', suffix, entity: {
                state_topic: this.stateTopic,
                command_topic: this.commandTopic,
                payload_on: JSON.stringify({ [key]: { id, state: true } }),
                payload_off: JSON.stringify({ [key]: { id, state: false } }),
                state_on: 'ON',
                state_off: 'OFF',
                ...entity
            }
        });

        // Router
        entities.push({ component: 'binary_sensor', suffix: 'wan', entity: { name: info.wan ? 'WAN' : 'Internet', device_class: 'connectivity', state_topic: this.stateTopic, value_template: `{{ 'ON' if value_json.wan else 'OFF' }}` } });
        if (this.has('wan_ip', info.wan?.ipv4)) sensor('wan_ip', { name: 'WAN IP', icon: 'mdi:ip-network', entity_category: 'diagnostic', value_template: state('.wan_ip') });
        if (info.systemInfo?.release?.version) sensor('firmware', { name: 'Firmware', icon: 'mdi:package-variant', entity_category: 'diagnostic', value_template: state('.firmware') });
        if (this.has('boot', system.uptime != null)) sensor('boot', { name: 'Last boot', device_class: 'timestamp', entity_category: 'diagnostic', value_template: state('.boot') });
        if (this.has('load', system.load != null)) sensor('load', { name: 'Load', icon: 'mdi:gauge', state_class: 'measurement', entity_category: 'diagnostic', value_template: state('.load') });
        if (this.has('memory', system.memory != null)) sensor('memory', { name: 'Memory usage', icon: 'mdi:memory', unit_of_measurement: '%', state_class: 'measurement', entity_category: 'diagnostic', value_template: state('.memory') });
        const clientsAvailable = this.has('clients', Object.values(ext.ifaces ?? {}).some(iface => iface.clients != null));
        if (clientsAvailable) sensor('clients', { name: 'Wi-Fi clients', icon: 'mdi:account-multiple', state_class: 'measurement', value_template: state('.clients') });
        button('reboot', { SystemReboot: true }, { name: 'Reboot', device_class: 'restart' });
        button('network_reload', { NetworkReload: true }, { name: 'Reload network', icon: 'mdi:lan-pending', entity_category: 'config' });
        button('wireless_reload', { WirelessReload: true }, { name: 'Reload Wi-Fi', icon: 'mdi:wifi-refresh', entity_category: 'config' });

        // Radios
        for (const radio of info.wirelessRadios ?? []) {
            const id = radio.name;
            const key = this.key(id);
            const label = BandLabel[radio.band] ?? id;
            const radioInfo = ext.radios?.[id] ?? {};
            toggle(`radio_${key}`, id, 'Radio', { name: `Wi-Fi ${label}`, icon: 'mdi:wifi', value_template: `{{ 'ON' if value_json.radios['${id}'].on else 'OFF' }}` });
            button(`radio_${key}_restart`, { RadioRestart: { id } }, { name: `Restart Wi-Fi ${label}`, device_class: 'restart', entity_category: 'config' });
            if (this.has(`radio_${key}_channel`, radioInfo.channel != null)) sensor(`radio_${key}_channel`, { name: `Channel ${label}`, icon: 'mdi:access-point', entity_category: 'diagnostic', value_template: state(`.radios['${id}'].channel`) });
            if (this.has(`radio_${key}_txpower`, radioInfo.txpower != null)) sensor(`radio_${key}_txpower`, { name: `TX power ${label}`, icon: 'mdi:signal', unit_of_measurement: 'dBm', state_class: 'measurement', entity_category: 'diagnostic', value_template: state(`.radios['${id}'].txpower`) });
        }

        // SSIDs, the id is the UCI section so renaming the network keeps the entity
        const uci = info.wirelessInfo?.values ?? {};
        for (const ssid of info.wirelessSsids ?? []) {
            if (!ssid.section || !ssid.name) continue;
            const id = ssid.section;
            const key = this.key(id);
            const label = `${ssid.name} ${BandLabel[ssid.band] ?? ssid.radio ?? ''}`.trim();
            toggle(`ssid_${key}`, id, 'Ssid', { name: label, icon: 'mdi:wifi-lock', value_template: `{{ 'ON' if value_json.ssids['${id}'].on else 'OFF' }}` });
            if (clientsAvailable && (ssid.mode ?? 'ap') === 'ap') sensor(`ssid_${key}_clients`, { name: `${label} clients`, icon: 'mdi:account-multiple', state_class: 'measurement', value_template: state(`.ssids['${id}'].clients`) });

            // QR code to join the network, access points only, contains the password so it is opt in
            if (this.wifiQr && (ssid.mode ?? 'ap') === 'ap') {
                const imageTopic = `${this.mqtt.config.prefix}/HA QR ${id}`;
                entities.push({ component: 'image', suffix: `ssid_${key}_qr`, entity: { name: `${label} QR code`, icon: 'mdi:qrcode', image_topic: imageTopic, content_type: 'image/svg+xml' } });
                images[imageTopic] = this.wifiQrCode(ssid, uci[id] ?? {});
            }
        }

        return { entities, images };
    }

    state(info) {
        const ext = info.extendedInfo ?? {};
        const system = ext.system ?? {};

        // Boot time from the uptime, kept while it moves less than two minutes so the sensor does not change every poll
        if (system.uptime != null) {
            const boot = Date.now() - system.uptime * 1000;
            if (this.bootTime === null || Math.abs(boot - this.bootTime) > 120_000) this.bootTime = Math.floor(boot / 60_000) * 60_000;
        }

        const radios = {};
        for (const radio of info.wirelessRadios ?? []) {
            const radioInfo = ext.radios?.[radio.name] ?? {};
            radios[radio.name] = { on: !radio.disabled, channel: radioInfo.channel ?? null, txpower: radioInfo.txpower ?? null };
        }

        const ssids = {};
        let clients = null;
        for (const ssid of info.wirelessSsids ?? []) {
            if (!ssid.section) continue;
            const count = ext.ifaces?.[ssid.section]?.clients ?? null;
            ssids[ssid.section] = { on: !ssid.disabled, clients: count };
            if (count != null) clients = (clients ?? 0) + count;
        }

        return {
            wan: info.wan ? info.wan.up : info.linkUp === true,
            wan_ip: info.wan?.ipv4 ?? null,
            firmware: info.systemInfo?.release?.version ?? null,
            boot: system.uptime != null ? new Date(this.bootTime).toISOString() : null,
            load: system.load ?? null,
            memory: system.memory ?? null,
            clients,
            radios,
            ssids
        };
    }

    // WIFI:T:<type>;S:<ssid>;P:<password>;H:<hidden>;; as read by the phone cameras, as SVG
    wifiQrCode(ssid, uci) {
        const escape = (text) => String(text ?? '').replace(/([\\;,:"])/g, '\\$1');
        const encryption = String(uci.encryption ?? 'none');
        const type = encryption.startsWith('wep') ? 'WEP' : ['none', 'owe'].includes(encryption) || !uci.key ? 'nopass' : 'WPA';
        const text = `WIFI:T:${type};S:${escape(ssid.name)};${type === 'nopass' ? '' : `P:${escape(uci.key)};`}${ssid.hidden ? 'H:true;' : ''};`;

        const qr = qrcode(0, 'M');
        qr.addData(text, 'Byte');
        qr.make();
        return qr.createSvgTag({ cellSize: 8, margin: 4, scalable: true });
    }

    // Object id part of a radio or UCI section name
    key(id) {
        return String(id).replace(/[^a-zA-Z0-9_-]/g, '_');
    }
}

export default HaDiscovery;
