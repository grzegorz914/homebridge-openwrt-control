# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Warning

- After update to v0.1.0 the plugin need to be reconfigured!

## [0.3.9] - (23.09.2026)

### Changes

- fix: MQTT client had `protocolVersion: 5` hardcoded, so brokers that only support MQTT 3.1.1 (e.g. the ioBroker MQTT adapter) accepted the TCP connection, failed the handshake, and got disconnected every second forever, with nothing published and no error logged. Added a `Protocol Version` option (5.0 / 3.1.1) in the MQTT section, and a one-time warning if no successful connection is established within 30 seconds
- readme update
- sample config update

## [0.3.8] - (23.09.2026)

### Added

- optional RESTful access `Token`. When set, every request (GET and POST) must send the header `Authorization: Bearer <token>`, otherwise the server responds `401`. Leaving it empty keeps the previous behaviour, so existing configs keep working
- readme update

## [0.3.7] - (13.09.2026)

### Changes

- bump dependencies

## [0.3.6] - (11.05.2026)

## Changes

- fix button commands not executing (wrong argument position in send call)
- fix external integration commands not executing (SystemReboot, NetworkReload, WirelessReload)
- fix radio status getCurrent searching wrong collection (wirelessSsids instead of wirelessRadios)
- fix SSID ConfiguredName onGet/onSet crash when SSID not found (missing null guard)
- fix logWarn never assigned in OpenWrt and Router classes
- fix logWarn not forwarded to RESTFul and MQTT integrations
- remove unused imports (AclPath, AclData, Functions) and dead code
- cleanup

## [0.3.2] - (18.02.2026)

## Changes

- MQTT refactor
- add funding
- bump deependencies
- readme updated
- cleanup

## [0.3.1] - (25.01.2026)

## Changes

- fix RESTFull and MQTT data present
- config schema updated
- readme updated
- cleanup

## [0.3.0] - (24.01.2026)

## Changes

- added ACL file to manually put in OpenWrt device
- added Fan as a additional control accessory type for Radio and SSID
- added possibility to change SSID name direct from Home app
- config schema updated
- readme updated
- cleanup

## [0.2.0] - (23.01.2026)

## Changes

- added link state monitoring
- added support radio restart instead of toggle on/off
- config schema updated
- readme updated
- cleanup

## [0.1.0] - (23.01.2026)

## Changes

- after update to v0.1.0 the plugin need to be reconfigured!
- added support to add radios dynamically without restart plugin
- added support to add ssids dynamically without restart plugin
- config validation improvements
- code refactor
- config schema update
- readme updated
- cleanup

## [0.0.9] - (20.01.2026)

## Changes

- readme update
- config schema update
- cleanup

## [0.0.8] - (20.01.2026)

## Changes

- readme update
- config schema update
- cleanup

## [0.0.7] - (20.01.2026)

## Changes

- readme update
- config schema update
- cleanup

## [0.0.6] - (19.01.2026)

## Changes

- config schema refactor and optimizations
- readme update
- cleanup

## [0.0.5] - (18.01.2026)

## Changes

- added name properties to config chema

## [0.0.4] - (18.01.2026)

## Changes

- added direct controll function over extra buttons
- added RESTFul and MQTT first functionality
- refactor and optimizations
- config schema updated
- readme updated
- cleanup

## [0.0.3] - (18.01.2026)

## Changes

- added support to use same ssids names on different radios
- fix ssid control
- refactor and optimizations
- cleanup

## [0.0.2] - (17.01.2026)

## Changes

- added RESTFul and MQTT external integration (work in progress)
- refactor and optimizations
- cleanup

## [0.0.1] - (16.01.2026)

## Changes

- initial release (WLAN control)
