<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-openwrt-control"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-openwrt-control/main/graphics/openwrt.png" width="640"></a>
</p>

<span align="center">

# Homebridge OpenWrt Control  

[![verified-by-homebridge](https://img.shields.io/badge/homebridge-verified-purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![npm](https://shields.io/npm/dt/homebridge-openwrt-control?color=purple)](https://www.npmjs.com/package/homebridge-openwrt-control)
[![npm](https://shields.io/npm/v/homebridge-openwrt-control?color=purple)](https://www.npmjs.com/package/homebridge-openwrt-control)
[![npm](https://img.shields.io/npm/v/homebridge-openwrt-control/beta.svg?style=flat-square)](https://www.npmjs.com/package/homebridge-openwrt-control)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/grzegorz914/homebridge-openwrt-control.svg)](https://github.com/grzegorz914/homebridge-openwrt-control/pulls)
[![GitHub issues](https://img.shields.io/github/issues/grzegorz914/homebridge-openwrt-control.svg)](https://github.com/grzegorz914/homebridge-openwrt-control/issues)

 Homebridge plugin for OpenWrt devices.
  
</span>

## Package Requirements

| Package | Installation | Role | Required |
| --- | --- | --- | --- |
| [Homebridge](https://github.com/homebridge/homebridge) | [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki) | HomeKit Bridge | Required |
| [Homebridge UI](https://github.com/homebridge/homebridge-config-ui-x) | [Homebridge UI Wiki](https://github.com/homebridge/homebridge-config-ui-x/wiki) | Homebridge User Interface | Recommended |
| [OpenWrt Control](https://www.npmjs.com/package/homebridge-openwrt-control) | [Plug-In Wiki](https://github.com/grzegorz914/homebridge-openwrt-control/wiki) | Homebridge Plug-In | Required |
| [OpenWrt ACL File](https://github.com/grzegorz914/homebridge-openwrt-control/blob/main/homebridge-acl.json) | `/usr/share/rpcd/acl.d/` | Access Control | Recommended |

## Note

* To use all of functions need to download [ACL File](https://github.com/grzegorz914/homebridge-openwrt-control/blob/main/homebridge-acl.json) and put in to `/usr/share/rpcd/acl.d/` folder on your router.
* After put it restart OpenWrt or RPCD service.

## About The Plugin

* Router:
  * Control:
    * System reboot.
    * Network reload.
    * Wireless reload.
  * Sensor:
    * Link `Up/Down`.
* Wireless:
  * Control:
    * Radio `On/Off/Restart`.
    * SSID `On/Off/Change Name`.
  * Sensor:
    * Radio `Enabled/Disabled`.
    * SSID `Enabled/Disabled`.
* Siri, automations and schortcuts control all of available functions.
* External integrations include: [REST](https://github.com/grzegorz914/homebridge-openwrt-control?tab=readme-ov-file#restful-integration) and [MQTT](https://github.com/grzegorz914/homebridge-openwrt-control?tab=readme-ov-file#mqtt-integration).

## Configuration

* Run this plugin as a [Child Bridge](https://github.com/homebridge/homebridge/wiki/Child-Bridges) (Highly Recommended), this prevent crash Homebridge.
* Install and use [Homebridge UI](https://github.com/homebridge/homebridge-config-ui-x/wiki) to configure this plugin.
* The `sample-config.json` can be edited and used as an alternative.

<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-openwrt-control"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-openwrt-control/main/graphics/ustawienia.png" width="840"></a>
</p>

| Key | Description |
| --- | --- |
| `name` | Here set Your own device name. |
| `host` | Here set the device `IP Address` or `Hostname`.|
| `displayType` | Here set the device state: `0 - Disabled`, `1 - Enabled`. |
| `auth{}` | Authorization object. |
| `auth.enable` | Here enable authorizatin credentials. |
| `auth.user` | Here set the authorization `Username`. |
| `auth.passwd` | Here set the authorization `Password`. |
| `wireless{}` | Wireless object. |
| `wireless.radio{}` | Wireless `Radio` object. |
| `wireless.radio.control{}` | Wireless `Radio` control object. |
| `wireless.radio.control.displayType` | Aaccessory type for `Radio` control in Home app: `0 - Disabled`, `1 - Switch`, `2 - Outlet`, `3 - Lightbulb`, `4 - Fan`. |
| `wireless.radio.control.namePrefix` | Here enable device name as a prefix for `Radio` control name. |
| `wireless.radio.sensor{}` | Wireless `Radio` sensor object. |
| `wireless.radio.sensor.displayType` | Accessory type for `Radio` sensor in Home app: `0 - Disabled`, `1 - Motion Sensor`, `2 - Occupancy Sensor`, `3 - Contact Sensor`. |
| `wireless.radio.control.restart` | Here enable restart `Radio` instead of toggle. |
| `wireless.radio.sensor.namePrefix` | Here enable device name as a prefix for `Radio` sensor name. |
| `wireless.ssid{}` | Wireless `SSID` object. |
| `wireless.ssid.control{}` | Wireless `SSID` control object. |
| `wireless.ssid.control.displayType` | Aaccessory type for `SSID` control in Home app: `0 - Disabled`, `1 - Switch`, `2 - Outlet`, `3 - Lightbulb`, `4 - Fan`. |
| `wireless.ssid.sensor{}` | Wireless `SSID` sensor object. |
| `wireless.ssid.sensor.displayType` | Accessory type for `SSID` sensor in Home app: `0 - Disabled`, `1 - Motion Sensor`, `2 - Occupancy Sensor`, `3 - Contact Sensor`. |
| `buttons[]` | Buttons array. |
| `buttons[].displayType` | Accessory type for `Button` in Home app, possible `0 - Disabled`, `1 - Outlet`, `2 - Switch`. |
| `buttons[].name` | Here set button `Name` which You want expose to the `Homebridge/HomeKit`.|
| `buttons[].command` | Here choose command which will be assigned to the button. |
| `buttons[].namePrefix` | Here enable device name as a prefix for the `Button` name. |
| `refreshInterval` | Here set the data refresh time in seconds. |
| `log.deviceInfo` | If enabled, log device info will be displayed by every restart of plugin. |
| `log.success` | If enabled, success log will be displayed in console. |
| `log.info` | If enabled, info log will be displayed in console. |
| `log.warn` | If enabled, warn log will be displayed in console. |
| `log.error` | If enabled, error log will be displayed in console. |
| `log.debug` | If enabled, debug log will be displayed in console. |
| `restFul{}` | RESTFul object. |
| `restFul.enable` | If enabled, RESTful server will start automatically and respond to any path request. |
| `restFul.port` | Here set the listening `Port` for RESTful server. |
| `mqtt{}` | MQTT object. |
| `mqtt.enable` | If enabled, MQTT Broker will start automatically and publish all available data. |
| `mqtt.host` | Here set the `IP Address` or `Hostname` for MQTT Broker. |
| `mqtt.port` | Here set the `Port` for MQTT Broker, default 1883. |
| `mqtt.clientId` | Here optional set the `Client Id` of MQTT Broker. |
| `mqtt.prefix` | Here set the `Prefix` for `Topic` or leave empty. |
| `mqtt.auth{}` | MQTT authorization object. |
| `mqtt.auth.enable` | Here enable authorization for MQTT Broker. |
| `mqtt.auth.user` | Here set the MQTT Broker `Username`. |
| `mqtt.auth.passwd` | Here set the MQTT Broker `Password`. |

### REST Integration

REST POST calls must include a content-type header of `application/json`.
Path `status` response all available paths.

| Method | URL | Path | Response | Type |
| --- | --- | --- | --- | --- |
| GET | `http//ip:port` | `info` | `{ state: false, info: 'Connect Success', linkUp: false, systemInfo: {}, networkInfo: {}, wirelessInfo: {}, wirelessRadios: [], wirelessSsids: [] }` | JSON |

| Method | URL | Key | Value | Type | Description |
| --- | --- | --- | --- | --- | --- |
| POST | `http//ip:port` | `SystemReboot` | `true` | boolean | Reboot device |
|      | `http//ip:port` | `NetworkReload` | `true` | boolean | Network reload |
|      | `http//ip:port` | `WirelessReload` | `true` | boolean | Wireless Reload |

### MQTT Integration

Subscribe using JSON `{ "SystemReboot": true }`

| Method | Topic | Message | Type |
| --- | --- | --- | --- |
| Publish | `Info` | `{ state: false, info: 'Connect Success', linkUp: false, systemInfo: {}, networkInfo: {}, wirelessInfo: {}, wirelessRadios: [], wirelessSsids: [] }` | JSON |

| Method | Topic | Key | Value | Type | Description |
| --- | --- | --- | --- | --- | --- |
| Subscribe | `Set` | `SystemReboot` | `true` | boolean | Reboot device |
|           | `Set` | `NetworkReload` | `true` | boolean | Network reload |
|           | `Set` | `WirelessReload` | `true` | boolean | Wireless Reload |
