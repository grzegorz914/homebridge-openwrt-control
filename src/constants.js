export const PlatformName = "OpenWrt";
export const PluginName = "homebridge-openwrt-control";

export const AclPath = '/usr/share/rpcd/acl.d/homebridgeacl.json';
export const AclData = {
    "homebridge": {
        "description": "Limited user for wireless, network control and interface status",
        "read": {
            "ubus": {
                "network.wireless": [
                    "*"
                ],
                "network.interface": [
                    "*"
                ],
                "system": [
                    "*"
                ]
            }
        },
        "write": {
            "ubus": {
                "uci": ["get", "set", "commit"],
                "network.wireless": ["down", "up", "reload"],
                "network": ["reload"],
                "system": ["reboot"],
                "service": ["restart"],
                "file": ["write"]
            }
        }
    }
}

