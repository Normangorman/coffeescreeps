/**
 * Created by Ben on 25/11/2016.
 */
let Log = require('logger')('order.road');
let Order = require('order.base');

class OrderRoad extends Order {
    static get type() { return 'road' }

    static new(teamId, roomName, serializedPath) {
        Log.debug("new: teamId {}, roomName {}, serializedPath {}", teamId, serializedPath);
        let meta = super.new(teamId, roomName);

        if (!_.isString(serializedPath)) {
            Log.error("new OrderRoad but path is not serialized");
        }
        meta.path = serializedPath;
        return meta;
    }
}

module.exports = OrderRoad;