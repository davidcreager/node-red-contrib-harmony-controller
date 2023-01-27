module.exports = function(RED) {
	const getHarmonyClient = require('@harmonyhub/client-ws').getHarmonyClient
	const inspect = require("util").inspect;
    RED.nodes.registerType("harmony-controller",HarmonyController);
	function HarmonyController(config) {
		RED.nodes.createNode(this,config);
		this.harmonyClients = {};
		//	getCurrentActivity, getActivities, startActivity, turnOff, isOff
		// end()
        var node = this;
		this.connect = async (ip) => {
			try {
				node.harmonyClients[ip] = await getHarmonyClient(ip);
				node.harmonyClients[ip].on("stateDigest", digest => {this.onStateDigest(ip, digest)} )
				return node.harmonyClients[ip]
			} catch (er) {
				node.error("" + er);
				this.onError(ip, "[connect]", er);
				return null;
			}
		}
		node.status({fill: "blue", shape: "ring", text: "ready"});
		node.on('close', ()=> {
			node.warn("[HarmonyController][info] Closing " + Object.values(node.harmonyClients).length + " connections");
			Object.keys(node.harmonyClients).forEach( async har => {
				if ( node.harmonyClients[har] && typeof(node.harmonyClients[har]) != "undefined" ) {
					try {await node.harmonyClients[har].end()} catch (e) { node.error("[Harmony-Controller][onClose] Error ending controller " + har + " " + e)}
				}
			});
		});
        node.on('input', async (msg) => {
			const validCommands = ["connect", "disconnect", "clear", "status"];
			if ( typeof(msg.payload) == "object" && msg.payload.hasOwnProperty("cmd") ) {
				if (!node.harmonyClients[msg.ip]) {
					node.warn("[HarmonyController][debug][cmd] " + msg.ip + " not connected, will connect ");
					if( !await node.connect(msg.ip) ) return null;
				}
				const result = await node.harmonyClients[msg.ip].startActivity(msg.payload.activity);
				node.warn(["[onInput[cmd][debug] " + " startActivity result=",result]);
				//node.send({topic: ( node.harmonyClients[msg.ip]?.topic || "unknown" ) + "/response", ip: msg.ip, cmd: msg.payload, payload: result});
			} else if ( validCommands.includes(msg.payload) ) {
				if ( (msg.payload == "clear" || msg.payload == "disconnect" || msg.payload == "command") && !msg.ip ) {
					node.error("[HarmonyController] connect or disconnect must supply msg.ip ");
					node.status({fill: "red", shape: "ring", text: "Msg.ip not valid"});
					return null;
				}
				if (msg.payload == "status") {
					node.warn("HarmonyController][info][status] " + Object.values(node.harmonyClients).length + " Servers");
					Object.keys(node.harmonyClients).forEach( async har => {
						const activities = await node.harmonyClients[har].getActivities();
						if (node.harmonyClients[har] != null) {
							node.warn("HarmonyController][info][status] " + har + " activities=" + activities.map( act => act.label).join(","));
						} else {
							node.warn("HarmonyController][info][status] " + har + " is not set up" );
						}
					});
					return null;
				} else if (msg.payload == "clear") {
					node.warn("[HarmonyController][info][clear] Clearing " + Object.values(node.harmonyClients).length + " Servers");
					Object.keys(node.harmonyClients).forEach( async har => {
						node.warn("[HarmonyController][info][clear] Closing " + har);
						if ( node.harmonyClients[har] && typeof(node.harmonyClients[har]) != "undefined" ) {
							try {await node.harmonyClients[har].end()} catch (e) { node.error("[Harmony-Controller][onInput][Clear] Error ending controller " + har + " " + e)}
						}
					});
					node.status({fill: "yellow", shape: "ring", text: "Cleared " + msg.ip})
					return null;
				} else 	if (msg.payload == "disconnect") {
					if ( !node.harmonyClients[msg.ip] || typeof(node.harmonyClients[msg.ip]) == "undefined" ) {
						node.warn("[HarmonyController][info][disconnect] Server " + msg.ip + " Not online ");
						return null;
					}
					node.warn("[HarmonyController][debug][disconnect] Closing Server " + msg.ip);
					try {await node.harmonyClients[msg.ip].end()} catch (e) { node.error("[Harmony-Controller][onInput][Clear] Error ending controller " + msg.ip + " " + e)}
					node.status({fill: "blue", shape: "ring", text: "disconnecting "});
					return null;
				} else if (msg.payload == "connect") {
					if (node.harmonyClients[msg.ip]) {
						node.warn("[HarmonyController][info] Server " + msg.ip + " already connected will close and reconnect");
						try {await node.harmonyClients[msg.ip].end()} catch (e) { node.error("[Harmony-Controller][onInput][Clear] Error ending controller " + msg.ip + " " + e)}
						node.warn("[HarmonyController][connect]  Re Opening " + msg.ip);
					} else {
						node.warn("[HarmonyController][connect]  Opening " + msg.ip);
					}
					if( !await node.connect(msg.ip) ) return null;
					node.status({fill: "blue", shape: "ring", text: "connecting to " + msg.ip})
				}
				return null;
			} else {
				node.error("[websock] Payload must be connect|disconnect||clear was  " + msg.payload);
				node.status({fill: "red", shape: "ring", text: "Unknown payload " + msg.payload});
				return null;
			}
        });
    }
}