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

## About The Plugin

* Access Point:
  * SSIDs `ON/OFF` state control.
  * SSIDs `ON/OFF` state monitor.
* Switch Port:
  * Comming soon.
* Buttons:
  * System reboot.
  * Network reload.
  * WiFi reload.
* Siri:
  * SSIDs set `ON/OFF` control.
  * SSIDs get `ON/OFF` state.
* Home automations and shortcuts can be used for all available functions.
* External integrations include: [REST](https://github.com/grzegorz914/homebridge-openwrt-control?tab=readme-ov-file#restful-integration) and [MQTT](https://github.com/grzegorz914/homebridge-openwrt-control?tab=readme-ov-file#mqtt-integration).

## Configuration

* Run this plugin as a [Child Bridge](https://github.com/homebridge/homebridge/wiki/Child-Bridges) (Highly Recommended), this prevent crash Homebridge if plugin crashes.
* Install and use [Homebridge UI](https://github.com/homebridge/homebridge-config-ui-x/wiki) to configure this plugin.
* The `sample-config.json` can be edited and used as an alternative.

<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-openwrt-control"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-openwrt-control/main/graphics/ustawienia.png" width="840"></a>
</p>

| Key | Description |
| --- | --- |
| `name` | Here set the accessory `Name` to be displayed in `Homebridge/HomeKit`. |
| `host` | Here set the `Hsostname or Address IP` of Sat Receiver.|
| `displayType` | Accessory type to be displayed in Home app: `0 - Disable`, `1 - Enable`. |
| `auth{}` | Authorization object. |
| `auth.enable` | If enabled, authorizatins credentials will be used for login. |
| `auth.user` | Here set the authorization `Username`. |
| `auth.passwd` | Here set the authorization `Password`. |
| `apDevice{}` | Access Point. |
| `apDevice.enable` | Here enable access point support. |
| `apDevice.name` | Here set Your own access point name or leave empty. |
| `apDevice.namePrefix` | Here enable accessory name as a prefix for access point name. |
| `apDevice.control{}` | Access Point control. |
| `apDevice.control.displayType` | Accessory type for Home app: `0` - None/Disabled, `1` - Switch, `2` - Outlet, `3` - Lightbulb. |
| `apDevice.control.namePrefix` | Here enable accessory name as a prefix for `SSIDs` control name. |
| `apDevice.sensor{}` | Access Point sensor. |
| `apDevice.sensor.displayType` | Accessory type to be displayed in Home app: `0` - None/Disabled, `1` - Motion Sensor, `2` - Occupancy Sensor, `3` - Contact Sensor. |
| `apDevice.sensor.namePrefix` | Here enable accessory name as a prefix for `SSIDs` sensor name. |
| `swDevice{}` | Access Point. |
| `swDevice.enable` | Here enable switch support. |
| `swDevice.name` | Here set Your own switch name or leave empty. |
| `swDevice.namePrefix` | Here enable accessory name as a prefix for switch name. |
| `swDevice.control{}` | Access Point control. |
| `swDevice.control.displayType` | Accessory type for Home app: `0` - None/Disabled, `1` - Switch, `2` - Outlet, `3` - Lightbulb. |
| `swDevice.control.namePrefix` | Here enable accessory name as a prefix for `Ports` control name. |
| `swDevice.sensor{}` | Access Point sensor. |
| `swDevice.sensor.displayType` | Accessory type to be displayed in Home app: `0` - None/Disabled, `1` - Motion Sensor, `2` - Occupancy Sensor, `3` - Contact Sensor. |
| `swDevice.sensor.namePrefix` | Here enable accessory name as a prefix for `Ports` sensor name. |
| `buttons[]` | Buttons array. |
| `buttons[].displayType` | Here choose display type in HomeKit app, possible `0 - None/Disabled`, `1 - Outlet`, `2 - Switch`.|
| `buttons[].name` | Here set `Button Name` which You want expose to the `Homebridge/HomeKit`.|
| `buttons[].command` | Here choose command which will be assigned to the button. |
| `buttons[].namePrefix` | Here enable the accessory name as a prefix for button name. |
| `refreshInterval` | Here set the data refresh time in seconds. |
| `log.deviceInfo` | If enabled, log device info will be displayed by every connections device to the network. |
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
| GET | `http//ip:port` | `info` | `{ state: false, info: '', systemInfo: {}, networkInfo: {}, wirelessStatus: {}, wirelessRadios: [], wirelessSsids: [] }` | JSON |

| Method | URL | Key | Value | Type | Description |
| --- | --- | --- | --- | --- | --- |
| POST | `http//ip:port` | `SystemReboot` | `true` | boolean | Reboot device |
|      | `http//ip:port` | `NetworkReload` | `true` | boolean | Network reload |
|      | `http//ip:port` | `WiFiReload` | `true` | boolean | WiFi Reload |

### MQTT Integration

Subscribe using JSON `{ "SystemReboot": true }`

| Method | Topic | Message | Type |
| --- | --- | --- | --- |
| Publish | `Info` | `{ state: false, info: '', systemInfo: {}, networkInfo: {}, wirelessStatus: {}, wirelessRadios: [], wirelessSsids: [] }` | JSON |

| Method | Topic | Key | Value | Type | Description |
| --- | --- | --- | --- | --- | --- |
| Subscribe | `Set` | `SystemReboot` | `true` | boolean | Reboot device |
|           | `Set` | `NetworkReload` | `true` | boolean | Network reload |
|           | `Set` | `WiFiReload` | `true` | boolean | WiFi Reload |
