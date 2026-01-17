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

 Homebridge plugin for OpenWrt flashed devices.
  
</span>

## Package Requirements

| Package | Installation | Role | Required |
| --- | --- | --- | --- |
| [Homebridge](https://github.com/homebridge/homebridge) | [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki) | HomeKit Bridge | Required |
| [Homebridge UI](https://github.com/homebridge/homebridge-config-ui-x) | [Homebridge UI Wiki](https://github.com/homebridge/homebridge-config-ui-x/wiki) | Homebridge User Interface | Recommended |
| [OpenWrt Control](https://www.npmjs.com/package/homebridge-openwrt-control) | [Plug-In Wiki](https://github.com/grzegorz914/homebridge-openwrt-control/wiki) | Homebridge Plug-In | Required |

## About The Plugin

* Access Points:
  * Control `ON/OFF` all exposed SSID.
  * Contact sensor monitor for all `SSIDs`.
* Siri can be used to switch ON/OFF SSIDs.
* Home automations and shortcuts can be used for all functions.

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
| `apDevice.enable` | Here enable access point `SSIDs` control. |
| `apDevice.name` | Here set Your own access point name or leave empty. |
| `apDevice.namePrefix` | Here enable accessory name as a prefix for access point name. |
| `apDevice.sensor` | Here enable access point `SSIDs` sensors. |
| `swDevice{}` | Switch object. |
| `swDevice.enable` | Here enable switch `Ports` control. |
| `swDevice.name` | Here set Your own name or for switch leave empty. |
| `swDevice.namePrefix` | Here enable accessory name as a prefix for switch name. |
| `swDevice.sensor` | Here enable switch `Ports` sensors. |
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
| `mqtt.enable` | If enabled, MQTT Broker will start automatically and publish all awailable data. |
| `mqtt.host` | Here set the `IP Address` or `Hostname` for MQTT Broker. |
| `mqtt.port` | Here set the `Port` for MQTT Broker, default 1883. |
| `mqtt.clientId` | Here optional set the `Client Id` of MQTT Broker. |
| `mqtt.prefix` | Here set the `Prefix` for `Topic` or leave empty. |
| `mqtt.auth{}` | MQTT authorization object. |
| `mqtt.auth.enable` | Here enable authorization for MQTT Broker. |
| `mqtt.auth.user` | Here set the MQTT Broker user. |
| `mqtt.auth.passwd` | Here set the MQTT Broker password. |
