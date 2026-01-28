class DeviceManager {
    constructor() {
        // Map<deviceId, { autoAnswer: boolean, pendingRequest: string | null }>
        this.devices = new Map();
    }

    registerDevice(deviceId) {
        if (!this.devices.has(deviceId)) {
            this.devices.set(deviceId, {
                id: deviceId,
                autoAnswer: false,
                lastSeen: new Date(),
                requests: []
            });
            console.log(`📱 New device registered: ${deviceId}`);
        } else {
            const device = this.devices.get(deviceId);
            device.lastSeen = new Date();
        }
        return this.devices.get(deviceId);
    }

    getDevice(deviceId) {
        return this.devices.get(deviceId);
    }

    getAllDevices() {
        return Array.from(this.devices.values());
    }

    toggleAutoAnswer(deviceId, state) {
        const device = this.devices.get(deviceId);
        if (device) {
            device.autoAnswer = state !== undefined ? state : !device.autoAnswer;
            return device;
        }
        return null;
    }

    isAutoAnswerEnabled(deviceId) {
        const device = this.devices.get(deviceId);
        return device ? device.autoAnswer : false;
    }
}

module.exports = DeviceManager;
